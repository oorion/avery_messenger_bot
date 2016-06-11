'use strict';

// 1. npm install body-parser express request 
// 2. Download and install ngrok from https://ngrok.com/download
// 3. ./ngrok http 8445
// 4. WIT_TOKEN=your_access_token FB_PAGE_ID=your_page_id FB_PAGE_TOKEN=your_page_token FB_VERIFY_TOKEN=verify_token node examples/messenger.js
// 5. Subscribe your page to the Webhooks using verify_token and `https://<your_ngrok_io>/fb` as callback URL.
// 6. Talk to your bot on Messenger!

const bodyParser = require('body-parser');
const express = require('express');
const request = require('request');
const Wit = require('node-wit').Wit;
const _ = require('underscore');

// Webserver parameter
const PORT = process.env.PORT || 8445;

// Wit.ai parameters
const WIT_TOKEN = process.env.WIT_TOKEN;

// Messenger API parameters
const FB_PAGE_ID = process.env.FB_PAGE_ID;
if (!FB_PAGE_ID) {
  throw new Error('missing FB_PAGE_ID');
}
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
if (!FB_PAGE_TOKEN) {
  throw new Error('missing FB_PAGE_TOKEN');
}
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

const FORECAST_TOKEN = process.env.FORECAST_TOKEN;

// Messenger API specific code

// See the Send API reference
// https://developers.facebook.com/docs/messenger-platform/send-api-reference
const fbReq = request.defaults({
  uri: 'https://graph.facebook.com/me/messages',
  method: 'POST',
  json: true,
  qs: { access_token: FB_PAGE_TOKEN },
  headers: {'Content-Type': 'application/json'},
});

const fbMessage = (recipientId, msg, cb) => {
  const opts = {
    form: {
      recipient: {
        id: recipientId,
      },
      message: {
        text: msg,
      },
    },
  };
  fbReq(opts, (err, resp, data) => {
    if (cb) {
      cb(err || data.error && data.error.message, data);
    }
  });
};

// See the Webhook reference
// https://developers.facebook.com/docs/messenger-platform/webhook-reference
const getFirstMessagingEntry = (body) => {
  const val = body.object == 'page' &&
    body.entry &&
    Array.isArray(body.entry) &&
    body.entry.length > 0 &&
    body.entry[0] &&
    body.entry[0].id === FB_PAGE_ID &&
    body.entry[0].messaging &&
    Array.isArray(body.entry[0].messaging) &&
    body.entry[0].messaging.length > 0 &&
    body.entry[0].messaging[0]
  ;
  return val || null;
};

// Wit.ai bot specific code

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
};

const firstEntityValue = (entities, entity) => {
  const val = entities && entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][0].value
  ;
  if (!val) {
    return null;
  }
  return typeof val === 'object' ? val.value : val;
};

// Our bot actions
const actions = {
  say(sessionId, context, message, cb) {
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      if (message.length >= 320)
      {
        var first_msg = message.substring(0, 319);
        fbMessage(recipientId, first_msg, (err, data) => {
          if (err) {
            console.log(
              'Oops! An error occurred while forwarding the response to',
              recipientId,
              ':',
              err
            );
          }
          var rest_msg = message.substring(320);
          fbMessage(recipientId, rest_msg, (err, data) => {
            if (err) {
              console.log(
                'Oops! An error occurred while forwarding the response to',
                recipientId,
                ':',
                err
              );
            }

            // Let's give the wheel back to our bot
            cb();
          });
        });
      }
      else{
        fbMessage(recipientId, message, (err, data) => {
          if (err) {
            console.log(
              'Oops! An error occurred while forwarding the response to',
              recipientId,
              ':',
              err
            );
          }

          // Let's give the wheel back to our bot
          cb();
        });
      }
    } else {
      console.log('Oops! Couldn\'t find user for session:', sessionId);
      // Giving the wheel back to our bot
      cb();
    }
  },
  merge(sessionId, context, entities, message, cb) {
    // Retrieve the location entity and store it into a context field
    const beerStyle = firstEntityValue(entities, 'beer_style');
    if (beerStyle) {
      context.beerStyle = beerStyle;
    }

    const beerName = firstEntityValue(entities, 'beer_name');
    if (beerName) {
      context.beerName = beerName;
    }

    const loc = firstEntityValue(entities, 'location');
    if (loc) {
      context.loc = loc;
    }

    cb(context);
  },
  error(sessionId, context, error) {
    console.log(error.message);
  },
  ['getStyle'](sessionId, context, cb) {
    request('http://apis.mondorobot.com/beer-filters', function (error, response, body) {
      var attributeList = JSON.parse(body).beer_filters;
      var styleAndStyleType = {};
      _.map(attributeList, function(val, key) {
        _.each(val, function(hash) {
          styleAndStyleType[hash.name] = key;
        });
      });
      var styleType = styleAndStyleType[context.beerStyle];
      var queryString = styleType + "=" + context.beerStyle;

      request('http://apis.mondorobot.com/beers?' + queryString, function (error, response, body) {
        var parsedBody = JSON.parse(body);
        var beersArray = _.map(parsedBody.beers, function(beer) {
          return beer.name;
        });

        var beerNamesAndIds = {}
        _.each(parsedBody.beers, function(beer) {
          beerNamesAndIds[beer.name] = beer.id;
        });
        context.beerNamesAndIds = beerNamesAndIds;
        var beersString = beersArray.join(", ");
        context.beers = beersString;

        cb(context);
      });
    });
  },
  ['getBeerInfo'](sessionId, context, cb) {
    var queryString = context.beerNamesAndIds[context.beerName.replace("'", "\\'")];
    request('http://apis.mondorobot.com/beers/' + queryString, function (error, response, body) {
      console.log(context.beerName.replace("'", "\\'"));
      console.log(context.beerNamesAndIds);
      console.log(context.beerNamesAndIds[context.beerName]);
      var parsedBody = JSON.parse(body);
      console.log(parsedBody);
      context.description = parsedBody.beer.name + ' is a ' + parsedBody.beer.style + ' with '+ parsedBody.beer.abv + '% ABV';
      cb(context);
    });
  },
  ['getOnTap'](sessionId, context, cb) {
    request('http://apis.mondorobot.com/taproom/on-tap', function (error, response, body) {
      var parsedBody = JSON.parse(body);
      var beersArray = _.map(parsedBody.beer_list.beers, function(beer) {
        return beer.name;
      });
      var beersString = beersArray.join(", ");
      context.beers = beersString;

      cb(context);
    });
  },
  ['getWeather'](sessionId, context, cb) {
    request('https://api.forecast.io/forecast/'+FORECAST_TOKEN+'/40.0626984,-105.2047749', function (error, response, body) {
      var parsedBody = JSON.parse(body);
      context.forecast = parsedBody.minutely.summary;

      cb(context);
    });
  },
  ['getEvents'](sessionId, context, cb) {

  },
  ['beerFinder'](sessionId, context, cb) {

  }
};

// Setting up our bot
const wit = new Wit(WIT_TOKEN, actions);

// Starting our webserver and putting it all together
const app = express();
app.set('port', PORT);
app.listen(app.get('port'));
app.use(bodyParser.json());

// Webhook setup
app.get('/fb', (req, res) => {
  if (!FB_VERIFY_TOKEN) {
    throw new Error('missing FB_VERIFY_TOKEN');
  }
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === FB_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(400);
  }
});

// Message handler
app.post('/fb', (req, res) => {
  // Parsing the Messenger API response
  const messaging = getFirstMessagingEntry(req.body);
  if (messaging && messaging.message && messaging.recipient.id === FB_PAGE_ID) {
    // Yay! We got a new message!

    // We retrieve the Facebook user ID of the sender
    const sender = messaging.sender.id;

    // We retrieve the user's current session, or create one if it doesn't exist
    // This is needed for our bot to figure out the conversation history
    const sessionId = findOrCreateSession(sender);

    // We retrieve the message content
    const msg = messaging.message.text;
    const atts = messaging.message.attachments;

    if (atts) {
      // We received an attachment

      // Let's reply with an automatic message
      fbMessage(
        sender,
        'Sorry I can only process text messages for now.'
      );
    } else if (msg) {
      // We received a text message

      // Let's forward the message to the Wit.ai Bot Engine
      // This will run all actions until our bot has nothing left to do
      wit.runActions(
        sessionId, // the user's current session
        msg, // the user's message 
        sessions[sessionId].context, // the user's current session state
        (error, context) => {
          if (error) {
            console.log('Oops! Got an error from Wit:', error);
          } else {
            // Our bot did everything it has to do.
            // Now it's waiting for further messages to proceed.
            console.log('Waiting for futher messages.');

            // Based on the session state, you might want to reset the session.
            // This depends heavily on the business logic of your bot.
            // Example:
            // if (context['done']) {
            //   delete sessions[sessionId];
            // }

            // Updating the user's current session state
            sessions[sessionId].context = context;
          }
        }
      );
    }
  }
  res.sendStatus(200);
});
