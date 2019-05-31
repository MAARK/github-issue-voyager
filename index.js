
const getConfigJson = require('./configFile').getConfigJson;
const JiraIssueVoyager = require('./issueJiraVoyager');
const GitHubIssueVoyager = require('./issueGitHubVoyager');
const log = require('./log'); 

module.exports = () => {

    const config = getConfigJson();

    async function main() {        
        let voyager;  
        if (config.migrationType === 'github') {
            voyager = new GitHubIssueVoyager(config);
        } else if (config.migrationType === 'jira') {
            voyager = new JiraIssueVoyager(config);
        } 
        return await voyager.execute();
    }

    (async () => {
        try {
            const result = await main();
            if (result) {
                log.success("🛳 You have reached your port of call. The issue voyage has successfully concluded.");
            }
        } catch (e) { 
            log.err(e);
        }
    })();

}; 
