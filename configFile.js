require('colors'); 
const argv = require('yargs').argv
const readFileSync = require('fs').readFileSync; 
const statSync = require('fs').statSync; 
const t = require('tcomb-validation'); 
const validate = require('tcomb-validation').validate;

module.exports = {
 
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

        const Repo = t.interface({
            repoOwner: t.String,
            repoName: t.String,
            token: t.maybe(t.String),
            rootURL: t.maybe(t.String)
        });
        
        const Config = t.interface({
            sourceRepository: Repo,
            destinationRepository: Repo
        });    

        const cf = argv.config;  

        if (!cf) {
            console.log('Please provide a config file using --config');
            process.exit(1);
        }

        if (!fileExists(cf)) {
            console.log('Unable to locate the specified configuration file');
            process.exit(1);
        }

        const configFile = readFileSync(cf, 'utf-8');

        const { error, json: configJson } = safeParseJSON(configFile);

        if (error) {
            console.log(`Invalid JSON. Details:\n`);
            console.log('⛔️ ', error.message.split('\n')[0]);
            process.exit(1);
        }
        
        const result = validate(configJson, Config);

        if (!result.isValid()) {
            console.log(`The configuation file is not valid. Details:\n`);
            result.errors.forEach(e => {
            console.log(
                `⚠️ Invalid value ${e.actual} supplied to ${e.path.join('/')}.`,
                `Expected a ${t.getTypeName(e.expected)}`
            );
            });
            process.exit(1)
        }

        return configJson; 
    } 


}
