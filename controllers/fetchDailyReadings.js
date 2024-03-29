const { Scraper, Root, CollectContent, OpenLinks } = require('nodejs-web-scraper');
const DailyReadingsJsonDB = require('./jsonDBController');
const CronJob = require('cron').CronJob;
const { format } = require('date-fns');
const cheerio = require('cheerio');


class WebScrapper {
    constructor(config, operations) {
        this.root = new Root();
        this.scrapper = new Scraper(config);
        this.operations = operations;
    }

    // add operations passed via param operations to the root
    addOperations() {
        return this.operations.map(operation => this.root.addOperation(operation))
    }

    main() {
        this.addOperations();
        return this.scrapper.scrape(this.root);
    }
}

class DailyReadings {
    constructor(req, res) {
        this.date = req.body?.date || new Date();
        this.res = res;
        this.results = [];
        this.pagesFromInnerLinks = []; //an array of pages downloaded from inner links
        this.validateDate();
        this.DailyReadingsJsonDB = new DailyReadingsJsonDB();
        this.fetchReadingsFromLocalDB();
        this.localDailyReadingsDBMidnightUpdater();
    }

    /**
     * @returns a formatted date
     */
    validateDate() {
        if (isNaN(new Date(this.date).getDate()))
            return this.res.status(400)
                .send({
                    error: "Optional param (date) of type Date not assignable to type " + typeof this.date
                })
        this.date = format(new Date(this.date).getTime(), 'MMddyy')
    }

    // get the day's actual readings
    fetchDaysReadings() {
        return new CollectContent('body', {
            name: "readings",
            contentType: "html",
            getElementContent: (contentHTML) => this.getReadings(contentHTML)
        });
    }

    // fetch readings from inner links
    fetchDaysReadingsFromInnerLinks() {
        return new OpenLinks('.b-note div div .p-wrap ul li a', {
            name: 'readingsFromInnerLink',
            getPageHtml: (downloadedHTML) => downloadedHTML && this.pagesFromInnerLinks.push(downloadedHTML)
        });
    }

    getReadings(htmlDocument) {
        let readings = [];
        let $ = cheerio.load(htmlDocument);
        readings.push({
            massId: $('.wr-block.b-lectionary.padding-top-s.padding-bottom-xxs.bg-white div div .innerblock h2').text().trim()
        });
        if ($('.wr-block.bg-white div div div.innerblock')) {
            $('.wr-block.bg-white div div div.innerblock').toArray()
                .map(element => {
                    let result = {
                        readingTitle: "",
                        readingAddress: "",
                        readingBody: "",
                        readingSource: "",
                    };
                    $ = cheerio.load(element);
                    result.readingTitle = $('.content-header h3').text().trim();
                    result.readingAddress = $('.content-header .address a').text();
                    result.readingBody = $('.content-body p span span').find("br").replaceWith("\n").end().text() || $('.content-body').find("br").replaceWith("\n").end().text();
                    result.readingSource = $('.content-header .address a').attr('href');
                    if (result.readingAddress !== '' && result.readingTitle !== '' && result.readingBody !== '' && result.readingAddress !== '') {
                        readings.push(result);
                    }
                });
        }
        readings.length > 1 && this.results.push(readings);
    }


    /**
     * daily readings local DB updater at midnight
     */
    localDailyReadingsDBMidnightUpdater() {
        return new CronJob(
            '0 0 0 * * *',
            async () => {
                this.fetchAndWriteDailyReadingsToDB();
            },
            null,
            true,
            'America/Los_Angeles'
        );
    }


    async updateLocalDailyReadingsDBDaily(dailyReadings) {
        return await this.DailyReadingsJsonDB.pushData('dailyReadings', JSON.stringify(dailyReadings));
    }

    fetchReadingsFromLocalDB() {
        this.DailyReadingsJsonDB.getData('dailyReadings')
            .then(dailyReadings => {
                return JSON.stringify(dailyReadings) == '{}' ? this.fetchAndWriteDailyReadingsToDB() : this.res.status(200).send(dailyReadings);
            })
            .catch((err) => {
                console.error(err)
                this.res.status(500)
                    .send({
                        error: err.message
                    })
            })
    }

    fetchAndWriteDailyReadingsToDB() {
        const dailyReadingsURI = encodeURI(`https://bible.usccb.org/bible/readings/${this.date}.cfm`);
        let config = {
            baseSiteUrl: dailyReadingsURI,
            startUrl: dailyReadingsURI,
            concurrency: 10,//Maximum concurrent jobs. More than 10 is not recommended.Default is 3.
            maxRetries: 3,//The scraper will try to repeat a failed request few times(excluding 404). Default is 5.       
        };

        let operations = [this.fetchDaysReadings(), this.fetchDaysReadingsFromInnerLinks()]
        let webScrapper = new WebScrapper(config, operations);
        webScrapper.main()
            .then((response) => {
                return this.pagesFromInnerLinks.map(htmlDocument => {
                    this.getReadings(htmlDocument);
                });
            })
            .then(async res => {
                this.updateLocalDailyReadingsDBDaily(this.results);
                return this.res.status(200).send(this.results);
            })
            .catch((err) => {
                console.error(err)
                this.res.status(500)
                    .send({
                        error: err.message
                    })
            })
    }
}

exports.DailyReadings = DailyReadings;