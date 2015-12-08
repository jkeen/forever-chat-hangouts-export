var FS         = require('fs');
var Promise    = require('bluebird');
var Crypto     = require('crypto');
var _          = require('underscore');
var oboe       = require('oboe');


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

function mapParticipants(row) {
  var allParticipantMap = {};
  return new Promise(function(resolve, reject) {
    var conversation = row.conversation;
    if (conversation.participant_data) {
      _.each(conversation.participant_data, function(person) {
        var gaia_id = person.id.gaia_id;
        if(person.fallback_name && person.fallback_name !== null) {
          if(!allParticipantMap[gaia_id]) {
            allParticipantMap[gaia_id] = person.fallback_name;
          }
        }
      });
    }
    resolve({
      row: row,
      participants: allParticipantMap
    });
  }).catch(function(error) {
    console.log('Errored while trying to create conversation participant map');
    console.log(error);
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

function getFileExtensionFromUrl(url) {
  var extension = url.match(/\.([0-9a-z]+)(?:[\?#]|$)/i);
  if (extension) {
    return extension[1];
  }
  return "";
}

function buildMessages(conversationState, allParticipantMap) {
  var id = conversationState.conversation_id.id;
  var conversation = conversationState.conversation;
  var participantMap = getParticipantsFromConversation(conversation, allParticipantMap);
  var messages = [];

  // A conversation is made up of events
  _.each(conversationState.event, function(value, key) {
    var convoEvent = conversationState.event[key];
    var sender = participantMap[convoEvent.sender_id.gaia_id];
    var receiver = ""; //participantMap[convoEvent.receiver_id.gaia_id];
    var messageText = "";
    var timestamp = convoEvent.timestamp;
    if (convoEvent.chat_message) {
      var messageSegments = [];
      _.each(convoEvent.chat_message.message_content.segment, function(segment) {
        // All the known types
        if (segment.type === 'TEXT') {
          messageSegments.push({
            text: segment.text,
            type: 'text'
          });
          messageText += segment.text;
        }
        else if (segment.type === "LINE_BREAK") {
          messageSegments.push({
            text: '\n',
            type: 'text'
          });
          messageText += '\n';
        }
        else if (segment.type == "LINK") {
          messageText += segment.text;
          messageSegments.push({
            type: 'link',
            path: segment.link_data.link_title
          });
        }
      });

      var attachments = [];

      _.each(convoEvent.chat_message.message_content.attachment, function(attachment) {

        // {embed_item: { type: [ 'PLUS_PHOTO' ],
        //    'embeds.PlusPhoto.plus_photo': {  // This is keyed based off of the type, iterating through the keys and looking for a url property is easier
        //         <-- all the stuff we want -- >
        //     }}

        _.each(attachment.embed_item, function(value, key) {
          // The way these are keyed
          if (value.url) {
            var segment = {
              type: 'file',
              url: value.url
            };

            if (_.contains(['PHOTO', 'ANIMATED_PHOTO'], value.media_type)) {
              segment.file_type = _.compact(['image', getFileExtensionFromUrl(value.url)]).join('/');
            }
            else if (value.media_type === 'VIDEO') {
              segment.file_type = _.compact(['video', getFileExtensionFromUrl(value.url)]).join('/');
            }
            else if (value.media_type === 'AUDIO') {
              segment.file_type = _.compact(['audio', getFileExtensionFromUrl(value.url)]).join('/');
            }
            else if (!value.media_type) {
              segment.file_type = 'unknown';
            }

            // create a message segment for the file attachment
            messageSegments.push(segment);
          }
        });

        attachments.push(attachment);
      });

      messages.push({
        date:             timestamp,
        sender:           sender,
        receiver:         receiver,
        message_text:     messageText,
        message_segments: messageSegments,
        attachments:      attachments
      });
    }
  });

  return messages;
}

function processConversation(conversationState) {
  return mapParticipants(conversationState).then(function(result) {
      return buildMessages(result.row, result.participants);
  }).catch(function(err) {
    console.log('Process conversation failed with error: ');
    console.log(err);
  });
}

module.exports = function(path, locale) {
  return new Promise(function(resolve, reject) {
    var promises = [];

    function processConversationState(conversationState) {
      var conversationId = conversationState.conversation_id.id;
      console.log('started processing ' + conversationId);
      var processTask = processConversation(conversationState).then(function(taskResults) {
        console.log('finished processing ' + conversationId);
      }).catch(function(error) {
        console.log('error processing' + conversationId);
      });
      promises.push(processTask);
    }

    function fileProcessingDone(things) {
      return new Promise.all(promises).then(function(results) {

      }, function(reason) {

      });
    }

    oboe(FS.createReadStream(path))
    .node('conversation_state', processConversationState)
    .done(fileProcessingDone);
  });

};
