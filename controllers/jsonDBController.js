const JsonDB = require('node-json-db').JsonDB;
const Config = require("node-json-db").Config;

class DailyReadingsJsonDB {
    dailyReadingsDatabase = new JsonDB(new Config("dailyReadingsDatabase", true, true));

    constructor() { }

    async getData(path) {
        return await this.dailyReadingsDatabase.getData(path);
    }

    async pushData(path, data) {
        return await this.dailyReadingsDatabase.push(path, data, false);
    }

    async updateData(path, data) {
        return await this.dailyReadingsDatabase.push(path, data, true);
    }

    async deleteData(path) {
        return await this.dailyReadingsDatabase.delete(path);
    }
}

module.exports = DailyReadingsJsonDB;