var FS      = require('fs');
var RSVP    = require('rsvp');
var Crypto  = require('crypto');
var _       = require('underscore');
var oboe    = require('oboe');

var messageMap = {};
var attachmentMap = {};
var ordered = [];
var allParticipantMap = {};
var eventCount = 0;


// Resets the maps so on subsequent calls we don't get overlaps
function reset() {
  messageMap = {};
  attachmentMap = {};
  allParticipantMap = {};
  ordered = [];
}

// Generates a unique ID to prevent duplicates
function uniqueId(row){
  var info = [row.address, row.date, row.text, row.service];
  return Crypto.createHash('sha1').update(JSON.stringify(info)).digest('hex');
}

function buildBaseRow(row) {
  return {
    sha:            uniqueId(row),
    is_from_me:     row.is_from_me,
    date:           row.formatted_date,
    date_read:      row.formatted_date_read,
    text:           row.text,
    service:        row.service
  };
}

function mapMessage(id, row) {
  messageMap[id] = row;
}

function buildPayload() {
  var messages = [];
  for (var i = 0; i < ordered.length; i++) {
    var sha = ordered[i];
    var row = messageMap[sha];

    if (row) {
      // we don't want no dupes
      var message           = buildUniversalRow(row);
      message.attachments   = formattedAttachmentsForMessage(row);
      message.participants  = formattedParticipantMapForMessage(row);
      message.source        = sourceInfo(row);
      message               = setSenderAndReceiver(message);

      delete messageMap[sha];
      messages.push(JSON.stringify(message));
    }
  }

  return messages;
}

function mapParticipants(row) {
  return RSVP.Promise(function(resolve, reject) {
    var allParticipantMap = {};

    _.each(row, function(value, key) {
      var conversation = row[key].conversation_state.conversation;
      _.each(conversation.participant_data, function(person) {
        var gaia_id = person.id.gaia_id;
        if(person.fallback_name && person.fallback_name !== null) {
          if(!allParticipantMap[gaia_id]) {
            allParticipantMap[gaia_id] = person.fallback_name;
          }
        }
      });
    });

    resolve(allParticipantMap);
  });
}

function getParticipantsFromConversation(conversation, allParticipantMap) {
  var participants = [],
      participantMap = {};

  _.each(conversation.participant_data, function(value, key) {
    var person  = conversation.participant_data[key];
    var gaia_id = person.id.gaia_id;
    var name = "Unknown";
    if (person.fallback_name){
      name = person.fallback_name;
    }
    else {
      name = allParticipantMap[gaia_id];
    }

    participants.push(name);
    participantMap[gaia_id] = name;
  });

  return participantMap;
}

function buildMessages(row, allParticipantMap) {
  _.each(row, function(conversationState) {
    var id = conversationState.conversation_id.id;
    var conversation = conversationState.conversation_state.conversation;
    var participantMap = getParticipantsFromConversation(conversation, allParticipantMap);
    var events = [];

    // A conversation is made up of events
    _.each(conversationState.conversation_state.event, function(value, key) {

      var convoEvent = conversationState.conversation_state.event[key];

      eventCount = eventCount + 1;
      console.log(JSON.stringify(convoEvent));

      var sender = convoEvent.sender_id.gaia_id;
      var message = "";
      var timestamp = convoEvent.timestamp;
      if (convoEvent.chat_message) {
          // console.log(JSON.stringify(convoEvent.chat_message));
          // console.log('\n\n\n');

        _.each(convoEvent.chat_message.message_content.segment, function(segment) {
          // All the known types
          if (segment.type === 'TEXT') {
            message += segment.text;
          }
          else if (segment.type === "LINE_BREAK") {
            message += '\n';
          }
          else if (segment.type == "LINK") {
            message += segment.text;

            if (segment.link_data.link_target.match(/www\.google\.com\/url\?/)) {
            }
            else {
              // console.log(segment);

            }
          }
        });
        _.each(convoEvent.chat_message.message_content.attachment, function(attachment) {
          // console.log(attachment);

          m.attachments.push(attachment);
        });

        if (m.attachments.length > 0) {
          // console.log(JSON.stringify(convoEvent.chat_message));
          // console.log('\n\n\n')
        }
      }
    });
  });
}

function processConversation(conversation) {
  return RSVP.Promise(function(resolve, reject) {
    console.log('ok')
    return mapParticipants(conversation).then(function(participantMap) {
      var messages = buildMessages(conversation, participantMap);
      resolve(messages);
    }, function(reason) {
      console.log('map participant failed');
    }).catch(function(error) {
      console.log('something went wrong', error);
    });
  }).catch(function(e) {
    console.log('errrrrr')
  });
}


module.exports = function(path, locale) {
  return new RSVP.Promise(function(resolve, reject) {
    var i = 0;
    var promiseHash = {};
    oboe(FS.createReadStream(path))
    .node('conversation_state', function(c){
      var conversationId = c.conversation_id.id;
      promiseHash[conversationId] = processConversation(c);
    })
    .done(function(things) {
      return RSVP.hash(promiseHash).then(function(results) {

        console.log(Object.keys(results));

//        resolve(things);
      }, function(reason) {

      }).catch(function(error) {
  console.log('something went wrong', error);
});
    });
  });

};
