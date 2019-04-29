/*jshint esversion: 6 */

require('colors');
const getConfigJson = require('./configFile').getConfigJson;
const IssueJiraVoyager = require('./issueJiraVoyager');

module.exports = () => {

    const configJson = getConfigJson();

    async function main() {
        const voyager = new IssueJiraVoyager(configJson);
        const result = await voyager.execute();
    }

    // https://stackoverflow.com/questions/46515764/how-can-i-use-async-await-at-the-top-level
    (async () => {
        try {
            await main();
            console.log("🛳 Your GitHub Issue Voyage has been completed.");
        } catch (e) {
            console.error(e);
        }
    })();

}
