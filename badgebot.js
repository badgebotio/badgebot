const Twit = require('twit'); 
var Gists = require('gists');
const https = require('https');
const moment  = require('moment');
const findHashtags = require('find-hashtags');
const userMentions = require('get-user-mentions');
const { convertFile } = require('convert-svg-to-png');
const _ = require('underscore');
const async = require("async");
const fs = require('fs');
//const junk = require('junk');
//const path = require('path');
const request = require("request");
const rp = require('request-promise');
const convertSvgToPng = require("./svg-to-png.js");

const dotenv = require('dotenv');
dotenv.config({path: __dirname + '/./.env'});

const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN });


var gistsUsername = process.env.GITHUB_USERNAME;

const gists = new Gists({
    username: gistsUsername, 
    password: process.env.GITHUB_PASSWORD
});

const twit = new Twit({
    consumer_key:         process.env.TWITTER_CONSUMER_KEY,
    consumer_secret:      process.env.TWITTER_CONSUMER_SECRET,
    access_token:         process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret:  process.env.TWITTER_ACCES_TOKEN_SECRET
}); 


var badges = [];


// STARTS HERE. Get gists, badges & tweets
//module.exports = function(badgeName, completeCriteria) {
async.waterfall([
  getBadges,
  getTweets,
  cullTweets,
  processTweets
  ], function (err, result) {
      //console.log("RESULT "+result);
  });

/** Load up badges from Gists **/
function getBadges(callback) {
    async.waterfall([
        function(callback) {
            var badgeClassListGistId = process.env.BADGE_CLASS_LIST_GIST_ID;

            rp({uri:'https://gist.githubusercontent.com/'+gistsUsername+'/'+badgeClassListGistId+'/raw', simple:false})
                .then(function(body) {
                    callback(null, body);
                }
            );           
        },
        function(badgeList, callback) {          

            var badgeListArr  = badgeList.split(',');

           // console.log("BADGES LIST "+JSON.stringify(badgeListArr));
            callback(null, badgeListArr);
        },
        function(badgeListArr, callback) {
            async.eachSeries(badgeListArr, function(badgeGistId, callback) {
                rp({uri:'https://gist.githubusercontent.com/'+gistsUsername+'/'+badgeGistId+'/raw', simple:false})
                .then(function(body) {
                    var badge = JSON.parse(body);

                    badges.push(badge);
                    console.log("BADGE NAME "+badge.name);
                    callback();
                });

            }, function(badges){
                callback(badges);
            });
        }
    ], 
        function(err) {
                callback(null,badges);
    });
}


//function getTweets(bbGists, badges, callback) {
function getTweets(badges, callback) {

   //console.log("getTweets BADGES ARR "+ JSON.stringify(badges));

    var lastTweetIdGistId = process.env.LAST_TWEET_ID_GIST_ID;

    //console.log("lastTweetIdGistId "+lastTweetIdGistId);

    rp('https://gist.githubusercontent.com/'+gistsUsername+'/'+lastTweetIdGistId+'/raw')
        .then(function(body) {
            var lastTweetId  = body;

            console.log("lastTweetId "+JSON.stringify(lastTweetId));

            var options = {count: 200, 
            since_id: lastTweetId
            //exclude_replies: true,
            //include_rts: false
            }; //Twitter has a max of 200 per request.
            //if (lastTweetId) { options.since_id = lastTweetId; }

            //console.log("options "+ JSON.stringify(options));
            var lastTweetId_str = "";

            // Retrieve 200 tweets since last tweet id then save the last tweet id of this batch

            twit.get('/statuses/mentions_timeline', options, function(err, tweets, response) {
            
                if (tweets.length > 0) {
                    /** 
                        First result is the most recent tweet. Update this id so 
                        we can retrieve only most recent next batch.
                    **/

                   // console.log("TWEETS from Timeline "+JSON.stringify(tweets[0]));

                    lastTweetId_str = tweets[0].id_str;

                    console.log("LAST TWEET ID: "+tweets[0].id_str);


                    gists.edit(lastTweetIdGistId, {
                        "files": {
                            "last-twitter-id.txt": {
                                //"content": '1176248359457362000'//1142500227774967800'
                                //"content": '1184251545010999301'
                                "content": lastTweetId_str
                            }
                        }
                    })
                    .then(function(res) {
                       // console.log(res.body);
                        callback(null, badges,tweets);
                    })
                    .catch(function(err) {
                        console.log("ERR UPDATING LAST TWEET "+err);
                        callback(err);
                    });

                }
                else {

                    console.log("No Tweets");
                    callback(null, badges, tweets);
                }                   
            });
        })
        .catch(function(err) {
            console.log("TWitter Timeline Error " +err.statusCode);
            if(err) callback(err);
        }
    );
}

function cullTweets(badges, tweets, callback) { 
   // console.log("LATEST TWEETS "+JSON.stringify(tweets));
    var culledTweets = [];

    i= 0;
    async.each(tweets, function(tweet, callback) {
        //console.log("tweet.in_reply_to_status_id "+ tweet.in_reply_to_status_id);
        if (tweet.in_reply_to_status_id === null ) {
            console.log("tweet.id_str: "+ tweet.id_str);
            console.log("tweet.in_reply_to_status_id: "+ tweet.in_reply_to_status_id);
            culledTweets.push(tweet);
        }
        i++;
        if (i == tweets.length) {
            //console.log("CULLED TWEETS "+JSON.stringify(tweets));
            callback(culledTweets);
        }
    }, function(tweets) {
        callback(null, badges, culledTweets);
    });
}

/** Processing each tweet
1. Get hashtags; If no hashtags...
2. Get Badge; If no badge...
3. If criteria met, save badge assertion and tweet

**/

function processTweets(badges, tweets, callback) { 

   // console.log('badges '+ badges);
    //console.log("LATEST TWEETS "+JSON.stringify(tweets));

    if (tweets.length == 0){
        callback(null,"done"); // nothing to do until there are tweets
    }
    else {
        async.each(tweets, function(tweet, callback) {
            console.log("Tweet ID STR "+tweets[0].id_str);
            console.log("Tweet ID "+tweet.id_str);
            console.log("Tweet Text "+tweet.text);
            console.log("TWEET URL "+ "https://twitter.com/"+tweet.user.screen_name+"/status/"+tweet.id_str);
            
            // Evidence - tweeturl for now
            // Future issue - save base64 encoded image https://gist.github.com/madhums/e749dca107e26d72b64d
                        
            var tweetUrl = "https://twitter.com/"+tweet.user.screen_name+"/status/"+tweet.id_str;

            getBadgesFromTweet(tweet, badges, function(badge) {

                if (! _.isEmpty(badge)) {
                    //console.log("BADGE TO PROCESS "+ JSON.stringify(badge));

                    var tweetUser = tweet.user.screen_name.toLowerCase();
                    console.log("Tweet User "+ tweetUser);
                    var badgeClassUrl = badge.badge.id;
                    var badgeClassImage = badge.badge.image;
                    var badgeName = badge.badge.name;
                    var badgeHashtagId = badge.badge.hashtag_id;
                    var deleteHashTagId = badge.badge.delete_hashtag_id;
                    var badgeImageURL = process.env.S3_BUCKET_URL+process.env.S3_BADGE_IMAGES_FOLDER+"/"+badgeHashtagId+"-image.png";
                    var logic_function = badge.badge.criteria.details[0].logic_function; // assuming only one right now

                    console.log("logic_function: "+ logic_function);

                    console.log("BadgeClass Url: "+ badge.badge.id);
                    console.log("Badge Image Url: "+ badge.badge.image);

                    if (badge.command == "issue") {
                        console.log("Issue badge: "+badgeName);

                        /** 
                        Get earners
                        for now earner(s) is assumed to be mentioned username,
                        Future Issue:  do badge to tweeter 
                        (tweeter could include their own @username and it would work)
                        **/

                        async.series([
                            function(callback) {

                                if (logic_function == "tweet_text_self") { // future issue: make this logic more portable
                                    earners = [tweetUser];
                                }
                                else {
                                    // get earners & filter out @badgebotio
                                    o_earners = userMentions(tweet.text);
                                    // console.log("O EARNERS "+o_earners);
                                    earners = _.reject(userMentions(tweet.text), function(earner){
                                        return (earner.toLowerCase() == "@badgebotio"); 
                                    });
                                }
                                // earners = ['@someone', '@someonetoo'];
                                if (earners.length) {
                                    //To do: remove dupes
                                    console.log("EARNERS "+earners);  

                                    callback(null, _.uniq(earners));
                                }
                                else {
                                    callback("no earner");
                                }
                            },
                            function(callback) { //evidence_url

                                tweetUrl = "https://twitter.com/"+tweet.user.screen_name+"/status/"+tweet.id_str;
                                //console.log("TWEET URL "+tweetUrl);

                                callback(null,tweetUrl);

                            },

                            function(callback) { //get and encode png badge image
                                
                                var imageRequest = require('request').defaults({ encoding: null });

                                imageRequest.get(badgeImageURL, function (err, response, body) {

                                    if (!err && response.statusCode == 200) {
                                        data = new Buffer(body).toString('base64');
                                        callback(null,data);
                                    }
                                    else {
                                        callback(err);
                                    }
                                });
                            }

                            /**
                            Using hosted PNGs for now instead of generating from SVG

                            function(callback) { //png of badge image svg

                                var streamBadgeImagefile = fs.createWriteStream("badgeImage.svg");

                                https.get(badge.badge.image,function(response) {
                                    response.setEncoding('utf8');
                                
                                    var body = '';
                                    response.on('data', function (chunk) {
                                        body += chunk;
                                    });
                                
                                    badgeSVGFile = response.pipe(streamBadgeImagefile);
                                    response.on('end', function () {
                                      //  console.log('BODY: ' + body);
                                        badgeSVG = body;

                                        convertSvgToPng(body, []).then((png) => {
                                            const base64data = Buffer.from(png).toString('base64');
                                            //console.log("here is base64png", base64data);

                                            callback(null,base64data); 

                                        });
                                    });
                                });
                            }**/
                        ],
                        function(err, results) {

                            if (err){
                                console.log("ERR "+err);
                                // right now err is no earners
                            }

                            var earners = results[0];
                            var evidenceUrl = results[1];
                            var badgeImage = results[2];

                            console.log("EARNERS "+earners);  

                            async.each(earners, function(earner, callback) {
                                    
                                /** 
                                The open badges spec uses linked data and requires that
                                the @id of the assertion is the iri of the assertion but
                                since wer using gists, we don't know what the url will be
                                for the gist so we'll need to create the gist and then update
                                it with the assertion.
                                **/

                                async.waterfall([
                                    function(callback) {
                                        console.log("A "+badgeName+" for "+ earner);

                                        earner = earner.replace('@','');
                                        issuedDate = moment(Date.now()).format();
                                        filenameDate = moment(Date.now()).format('YYYY-MM-DD-HH-mm-ss');
                                            
                                        var filename = badgeHashtagId+"-"+earner+"-"+filenameDate+"-assertion.json";

                                        //create
                                        gistOptions = { //replace hardcoded badge name in description
                                            "description":"A You Rock! Open Badge Assertion for "+ earner, 
                                            "public":"true",
                                                "files": {
                                                [filename]: {
                                                    "content": "Placeholder for assertion"
                                                }
                                            }    
                                        };


                                        gists.create(gistOptions).then(function(res){
                                            callback(null, res.body, filename);
                                        }).catch(function(err) {
                                            console.log("ERR CREATING ASSERTION"+err);
                                            callback(err);
                                        });
                                         
                                    },
                                    function(gist, filename, callback) {
                                        console.log("ADD ASSERTION TO GIST: ");
                                        assertionUrl = "https://gist.githubusercontent.com/"+gistsUsername+"/"+gist.id+"/raw";
                                        console.log("ASSERTION URL "+JSON.stringify(assertionUrl));
                                        console.log("FILENAME "+filename);
                                        assertion = JSON.stringify({
                                            "@context": "https://w3id.org/openbadges/v2",
                                                "type": "Assertion",
                                                "id": assertionUrl,
                                                "recipient": {
                                                    "type": "url",
                                                    "hashed": false,
                                                    "identity": "https://twitter.com/"+earner,
                                                },
                                                "evidence": {
                                                    "id": tweetUrl,
                                                    "narrative": "Issued on Twitter by Badgebot from <a href=\"https://twitter.com/"+tweet.user.screen_name+"\">@"+tweet.user.screen_name+"</a>"
                                                },
                                                "issuedOn": issuedDate,
                                                "badge": badge.badge.id,
                                                "verification": {
                                                    "type": "hosted"
                                                }
                                        });

                                        gists.edit(gist.id, {
                                                "files": {
                                                    [filename]: {
                                                        "content": assertion
                                                    }
                                                }
                                            }).then(function(res){
                                                callback(null, res.body);
                                        }).catch(function(err) {
                                            console.log("ERR UPDATING ASSERTION "+err);
                                            callback(err);
                                        });
                                    }

                                ],
                                function(err, result) {
                                   // console.log("SEND TWEET "+earner);
                                    claimUrl = "http://badgebot.io/earned/"+result.id;

                                    if (logic_function == "tweet_text_self") {
                                        var msg = "Hi @"+earner+"! You can get your #"+badgeHashtagId+" badge here: "+claimUrl;
                                    }
                                    else {
                                        var msg = "Congratulations @"+earner+"! @"+tweet.user.screen_name+" issued you a #"+badgeHashtagId+". You can get this badge here: "+claimUrl;
                                    }
                                    
                                    /**
                                    Uploads the badge image and then sends it as part of the status update.
                                    Future Issue: create a player-card?
                                    https://developer.twitter.com/en/docs/tweets/optimize-with-cards/overview/player-card
                                    **/

                                    twit.post('media/upload', { media_data: badgeImage }, function (err, data, response) {
                                        //console.log("DATA "+JSON.stringify(data));
                                        //console.log("RESPONSE "+JSON.stringify(response));

                                        if (!err) {

                                            var mediaIdStr = data.media_id_string;
                                            var meta_params = { media_id: mediaIdStr, alt_text: { text: badgeName } }

                                            twit.post('media/metadata/create', meta_params, function (err, data, response) {
                                              //  console.log("TWITTER METADATA RESPONSE "+JSON.stringify(response));
                                                if (!err) {
                                                    // now we can reference the media and post a tweet (media will attach to the tweet)
                                                    console.log("BadgeBot Sucecss Response Tweet: "+msg);
                                                    var params = { status: msg, media_ids: [mediaIdStr] }
 
                                                    twit.post('statuses/update', params, function (err, data, response) {
                                                       // console.log("TWITTER RESPONSE "+JSON.stringify(response));
                                                        if (!err) {
                                                            callback();
                                                        }
                                                        else {
                                                            callback("TWITTER STATUS UPDATE ERR "+err);
                                                        }
                                                    });
                                                }
                                                else {
                                                    callback("TWITTER METADATA ERR "+err);
                                                }
                                            });
                                        }
                                        else {
                                            callback("TWITTER MEDIA UPLOAD ERR "+err);
                                        }
                                    });
                                },
                                function(err,result) {
                                    if (err) console.log("ASYNC WATERFALL ERR "+err);
                                        callback();
                                });
                            },
                            function(err,result) {
                                if (err) console.log("ASYNC EARNERS ERR "+err);
                                console.log("Done with earners");
                                    callback();
                            });
                        });

                    }
                    else {
                        console.log("Delete badge "+tweet.text);
                        console.log("YES DELETE "+ badgeName + " " +tweet.user.screen_name);
                        // get earner & assertion id from tweet
                        // example: @badgebotio #deleteyourockbadge-[assertionId]

                        /**
                        Get earner & assertion id from tweet
                        example: @badgebotio #deleteyourockbadge-[assertionId]

                        Retrieve gist first and check that the earner username matches this
                        tweet sender username.

                        If gist not retrievable - tweet back error

                        If match, attempt to delete gist

                        if delete gist success reply success message

                        if gist delete doesn't work - tweet back error.

                        Error tweet: reply with the url of your badge page at badgebotio to badgebotio or DM.
                        **/

                        var hashtagData = tweet.text.match(/(-)\w+/g);

                        if (hashtagData) {
                            console.log("hashtagData "+JSON.stringify(hashtagData));
                            console.log("hashtagData.length "+hashtagData.length);
                            var assertionGistId = hashtagData[0].replace("-","");

                           console.log("assertionGistId "+assertionGistId);

                            rp({uri:'https://gist.githubusercontent.com/'+gistsUsername+'/'+assertionGistId+'/raw', simple:false})
                                .then(function(body) {
                                   // console.log("BODY "+ body);
                                    assertionGist = JSON.parse(body);
                                    //console.log("RECIPIENT "+assertionGist.recipient.identity);

                                    var earner = assertionGist.recipient.identity.substring(assertionGist.recipient.identity.lastIndexOf('/') + 1);
                                    console.log("EARNER "+ earner);
                                    

                                    if (earner == tweetUser) {
                                        console.log("This is the earner requesting deletion");
                                        gists.delete(assertionGistId).then(function(res){
                                            console.log("BADGE Assertion "+assertionGist.id+" has been deleted.")
                                            var params = { status: '@'+tweetUser+', your '+badgeName+ ' issued on '+assertionGist.issuedOn+' has been deleted.'}
                                            twit.post('statuses/update', params, function (err, data, response) {
                                                // console.log(data)
                                                callback();
                                            });
                                        }).catch(function(err) {
                                            console.log("ERR DELETING ASSERTION "+err);
                                            callback(err);
                                        });
                                    }
                                    else {
                                        console.log("This username cannot delete this badge");
                                        var params = { status: '@'+tweetUser+', it appears you were trying to delete a badge. Please reply with the badge earned url or DM me with more information.' }
                                            twit.post('statuses/update', params, function (err, data, response) {
                                            // console.log(data)
                                            callback();
                                        });
                                    }
                                })
                                .catch(function (err) {
                                    console.log("RETRIEVING GIST TO DELETE ERR "+ err);
                                    var params = { status: '@'+tweetUser+', it appears you were trying to delete a badge. Please reply with the badge earned url or DM me with more information.' }
                                    twit.post('statuses/update', params, function (err, data, response) {
                                    // console.log(data)
                                        callback();
                                    });
                                });  

                        
                            
                        }
                    }

                }
                else {
                    console.log("No Badge - send a tweet");
                    var params = { status: '@'+tweet.user.screen_name+', did you wish to issue a badge? Learn more about BadgeBot here: https://badgebot.io' }
                    twit.post('statuses/update', params, function (err, data, response) {
                       // console.log(data)
                        callback();
                    });
                }            
            });
        },
        function(err, badge) {
           callback(null,"Done with tweets")
        });
    }
}

function getBadgesFromTweet(tweet, badges, callback) {
    var badge = {};
    async.waterfall([
        function(callback) {
            hashtagsFound = findHashtags(tweet.text);

            if (hashtagsFound.length) {
                console.log("HASHTAGS FOUND "+hashtagsFound);
                callback(null,hashtagsFound);
            }
            else {
                // no hashtags - nothing to do
                console.log("NO HASHTAGS FOUND");
                callback('no hashtags');
            }
        },
        function(hashtagsFound,callback) {

            for (let hashtag of hashtagsFound) {
                
                foundBadge = _.find(badges, function (obj) { 
                    return obj.hashtag_id == hashtag; 
                });

                if (foundBadge) {
                    //console.log("BADGE FOUND"+ foundBadge);
                    badge = {"badge" : foundBadge, "command" : 'issue'};
                    /** 
                    Stop here at first find.
                    But this is where other hashtag functionality can be considered
                    **/
                    callback(badge);
                    break;
                }
                else {
                    /**
                    Future issue: each badge has its own delete_hash_tag id. 
                    We don't really need this since the delete tweet includes 
                    the assertion id. 

                    It is a nicety that the bagde gets found though and we can use that in communication.

                    However, we can just get that badge info from the assertion.

                    This requires some re-coding so will revisit. 

                    **/
                    console.log(hashtag + ' may be a delete_hashtag_id');

                    foundBadge = _.find(badges, function (obj) { 
                        return obj.delete_hashtag_id == hashtag; 
                    });

                    if (foundBadge) {
                        //get assertion gist id from tweet and send it back
                        badge = {"badge" : foundBadge, "command" : 'delete'};
                        callback(badge);
                        break;
                    }
                    else {
                        console.log('Ignoring ' + hashtag + '. A badge could not be found.');
                        callback(); 
                    }
                }
            }
        }

    ], function (err) {
        //console.log("FOUND BADGE OBJ RESULT "+JSON.stringify(badge));
       // console.log(" TWEET ERR "+err);
        callback(badge); //badge obj
    });           
}