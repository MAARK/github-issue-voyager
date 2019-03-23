require('colors'); 
const getConfigJson = require('./configFile').getConfigJson; 
const GithubIssueMigrator = require('./githubIssueMigrator'); 

module.exports = () => {

    const configJson = getConfigJson(); 

    async function main() {
        const migrator = new GithubIssueMigrator(configJson); 
        const result = await migrator.execute();     
    }

    // https://stackoverflow.com/questions/46515764/how-can-i-use-async-await-at-the-top-level
    (async () => {
        try {
            await main();
            console.log("🤝 Migration completed");
        } catch (e) {
            console.error(e);
        }
    })();

}
