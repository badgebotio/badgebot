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
const badgeHeight = 800;
const badgeWidth = 800;


module.exports = function(svgData) {

const draw = SVG(document.documentElement);
var svg = draw.svg(svgData).width(badgeWidth).height(badgeHeight);
svg.transform({ x: 200, y: 25 }); 
/** 
Future issue: create a card for twitter image upload with the badge image in it

For now we are converting the badge image to a png and shifting it so it appears 
horizontally centered on twitter.
**/


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