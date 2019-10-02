/**
This file is replicated in badgebot-web.
Future Issue: Clean up how SVG images are used. Perhaps make a shared module that can be used for 
svg open badges
**/
const window   = require('svgdom');
const SVG      = require('svg.js')(window);
const svgpath = require('svgpath');
const document = window.document;
const { convert, convertFile } = require('convert-svg-to-png');

// needed constants
const badgeHeight = 720;
const badgeWidth = 720;


module.exports = function(svgData) {

const draw = SVG(document.documentElement);
const svg = draw.svg(svgData).width(badgeWidth).height(badgeHeight);

return localConvert(svg.svg());
}


async function localConvert(input, outputFilePath) {
    let options = { width: badgeWidth, height: badgeHeight };
    if (outputFilePath) {
        options = { ...options, filename: outputFilePath };
    }

  //console.log("options", options);
    return await convert(input, options).then((data) => {
        console.log("Successfully converted");
        return data;
    }, (error) => {
        const errorString = "ERROR:" + error;
        console.log(errorString);
        return errorString;
    });
}