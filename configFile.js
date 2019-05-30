const log = require('./log');  
const argv = require('yargs').argv
const readFileSync = require('fs').readFileSync; 
const statSync = require('fs').statSync; 
const t = require('tcomb-validation'); 
const validate = require('tcomb-validation').validate;

module.exports = {

    /*
     * Gets and validates the structure of the config file. Looks at command-line 
     * argument to determine config file path. 
     *   
     * Based on gh-issue-mover's https://github.com/buildo/gh-issue-mover/blob/master/src/config.js
     * 
     * @return {JSON} result 
     */

     getConfigJson: function() {

        function fileExists(filePath) {
            try {
            return statSync(filePath).isFile();
            } catch (e) {
            return false;
            }
        }

        function safeParseJSON(str) {
            try {
            return { json: JSON.parse(str) };
            } catch (error) {
            return { error };
            }
        }    

        function checkRequiredFields(json) {        
            return (
                json.migrationType === undefined || 
                json.sourceRepository.repoOwner === undefined || 
                json.sourceRepository.repoName === undefined || 
                json.sourceRepository.accessToken === undefined || 
                (json.migrationType === 'github' && json.destinationRepository.repoOwner === undefined) || 
                (json.migrationType === 'github' && json.destinationRepository.repoName === undefined) || 
                (json.migrationType === 'github' && json.destinationRepository.accessToken === undefined) 
            ); 
        }

        function populateDefaults(json) {
            let result = json; 
            result.options.method = json.options.method === undefined ? 'all':  json.options.method; 
            result.options.stickyUsers = json.options.stickyUsers === undefined ? true :  json.options.stickyUsers; 
            result.options.closeIssueWhenComplete = json.options.closeIssueWhenComplete === undefined ? false :  json.options.closeIssueWhenComplete; 
            result.options.addSourceComment = json.options.addSourceComment === undefined ? true :  json.options.addSourceComment;             
            result.options.exportPath = json.options.exportPath === undefined ? 'export':  json.options.exportPath;                         
            return result; 
        }

        const Repo = t.interface({
            repoOwner: t.String,
            repoName: t.String,
            accessToken: t.String
        });
        
        const Options = t.interface({
            method: t.String, 
            labels: t.maybe(t.list(t.String)), 
            issueNumbers: t.maybe(t.list(t.Number)), 
            stickyUsers: t.maybe(t.Boolean), 
            closeIssueWhenComplete: t.maybe(t.Boolean),
            exportPath: t.maybe(t.String)   
   
        }); 

        const Mapping = t.interface({
            source: t.String, 
            destination: t.String           
        }); 

        const UserMapping = t.interface({
            source: t.String, 
            destination: t.String, 
            destinationName: t.maybe(t.String)
        }); 

        const Mappings = t.interface({
            priorities: t.maybe(t.list(Mapping)),
            types: t.maybe(t.list(Mapping)),
            users: t.maybe(t.list(UserMapping))
        }); 

        const Config = t.interface({
            migrationType: t.String, 
            sourceRepository: Repo,
            destinationRepository: t.maybe(Repo), 
            options: t.maybe(Options), 
            mappings: t.maybe(Mappings)
        });    

        let cf = argv.config;  

        if (!cf) {
            cf = 'config.json'; 
            if (fileExists(cf)) {
                log.i('Using default config.json that was located in start-up directory.'); 
            } 
            else {
                log.err('Please provide a config file using --config');
                process.exit(1);
            }
        }

        if (!fileExists(cf)) {
            log.err('🚫 Unable to locate the specified configuration file.');
            process.exit(1);
        }

        const configFile = readFileSync(cf, 'utf-8');

        let { error, json: result } = safeParseJSON(configFile);

        if (error) {
            log.err(`🚫 Invalid JSON: ${error.message.replace(/\n/g,"")}`);
            process.exit(1);
        }
        
        const validateResult = validate(result, Config);
        if (!validateResult.isValid()) {
            log.err(`🚫 The configuation file is not valid. Details:\n`);
            validateResult.errors.forEach(e => {
                log.err(`Invalid value ${e.actual} supplied to ${e.path.join('/')}. Expected a ${t.getTypeName(e.expected)}`);
            });
            process.exit(1)
        }

        const missingRequiredFields = checkRequiredFields(result); 
        if (missingRequiredFields) {
            log.err(`🚫 The configuation file is missing required fields. Please add necessary information and try again.`);
            process.exit(1)
        }

        result = populateDefaults(result); 

        return result; 
    } 


}
