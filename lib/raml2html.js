#!/usr/bin/env node

'use strict';

var raml2obj = require('raml2obj');
var handlebars = require('handlebars');
var marked = require('marked');
var program = require('commander');
var fs = require('fs');
var pjson = require('../package.json');
var renderer = new marked.Renderer();


renderer.table = function(thead, tbody) {
    // Render Bootstrap tables
    return '<table class="table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
};

function _markDownHelper(text) {
    if (text && text.length) {
        return new handlebars.SafeString(marked(text, { renderer: renderer }));
    } else {
        return '';
    }
}

function _lockIconHelper(securedBy) {
    if (securedBy && securedBy.length) {
        var index = securedBy.indexOf(null);
        if (index !== -1) {
            securedBy.splice(index, 1);
        }

        if (securedBy.length) {
            return new handlebars.SafeString(' <span class="glyphicon glyphicon-lock" title="Authentication required"></span>');
        }
    }

    return '';
}

function _emptyResourceCheckHelper(options) {
    if (this.methods || (this.description && this.parentUrl)) {
	    return options.fn(this);
    }
}

/*
 The config object can contain the following keys and values:
 template: string containing the main template (required)
 https: boolean (optional)
 helpers: object with handlebars helpers (optional)
 partials: object with template partials (optional)
 processOutput: function that takes data, onSuccess and onError (optional)
 */
function render(source, config, onSuccess, onError) {
    config = config || {};
    config.protocol = config.https ? 'https:' : 'http:';
    config.raml2HtmlVersion = pjson.version;

    // Register handlebar helpers
    for (var helperName in config.helpers) {
        if (config.helpers.hasOwnProperty(helperName)) {
            handlebars.registerHelper(helperName, config.helpers[helperName]);
        }
    }

    // Register handlebar partials
    for (var partialName in config.partials) {
        if (config.partials.hasOwnProperty(partialName)) {
            handlebars.registerPartial(partialName, config.partials[partialName]);
        }
    }

    raml2obj.parse(source, function(ramlObj) {
        ramlObj.config = config;
        var result = handlebars.compile(config.template)(ramlObj);

        if (config.processOutput) {
            config.processOutput(result, onSuccess, onError)
        } else {
            onSuccess(result);
        }
    }, onError);
}

function getDefaultConfig(https, mainTemplate, resourceTemplate, itemTemplate) {
    return {
        https: https,
        template: mainTemplate,
        helpers: {
            emptyResourceCheck: _emptyResourceCheckHelper,
            md: _markDownHelper,
            lock: _lockIconHelper
        },
        partials: {
            resource: resourceTemplate,
            item: itemTemplate
        },
        processOutput: function(data, onSuccess, onError) {
            data = data.replace(/&quot;/g, '"');

            var Minimize = require('minimize');
            var minimize = new Minimize({quotes: true});

            minimize.parse(data, function(error, result) {
                if (error) {
                    onError(error);
                } else {
                    onSuccess(result);
                }
            });
        }
    };
}


if (require.main === module) {
    program
        .usage('[options] [RAML input file]')
        .version(pjson.version)
        .option('-i, --input [input]', 'RAML input file')
        .option('-s, --https', 'Use https links in the generated output')
        .option('-o, --output [output]', 'HTML output file')
        .option('-t, --template [template]', 'Path to custom template.handlebars file')
        .option('-r, --resource [resource]', 'Path to custom resource.handlebars file')
        .option('-m, --item [item]', 'Path to custom item.handlebars file')
        .parse(process.argv);

    var input = program.input;

    if (!input) {
        if (program.args.length !== 1) {
            console.error('Error: You need to specify the RAML input file');
            program.help();
            process.exit(1);
        }

        input = program.args[0];
    }

    var reader = new raml2obj.FileReader();
    var mainTemplate;
    var resourceTemplate;
    var itemTemplate;
    var https = program.https ? true : false;

    reader.readFileAsync(program.template || __dirname + '/template.handlebars').then(function(data) {
        mainTemplate = data;
        return reader.readFileAsync(program.resource || __dirname + '/resource.handlebars');
    }).then(function(data) {
        resourceTemplate = data;
        return reader.readFileAsync(program.item || __dirname + '/item.handlebars');
    }).then(function(data) {
        itemTemplate = data;

        // Start the rendering process
        render(input, getDefaultConfig(https, mainTemplate, resourceTemplate, itemTemplate), function(result) {
            if (program.output) {
                fs.writeFileSync(program.output, result);
            } else {
                // Simply output to console
                process.stdout.write(result);
                process.exit(0);
            }
        }, function(error) {
            console.log('Error parsing: ' + error);
            process.exit(1);
        });
    });
}


module.exports.getDefaultConfig = getDefaultConfig;
module.exports.render = render;
