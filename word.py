import re

import endpoints
import webapp2
from webapp2_extras import json

from google.appengine.api import urlfetch
from google.appengine.ext import ndb
from google.appengine.ext.ndb import msgprop

from protorpc import messages

_WORDNIK_API_KEY = "a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5"

def FindDataBetween(contents, startTag, endTag, startPosition = None):
    start = contents.find(startTag, startPosition)
    if start == -1:
        raise endpoints.NotFoundException("could not find {} after {} position".format(startTag, startPosition))
    end = contents.find(endTag, start + len(startTag))
    if end == -1:
        raise endpoints.NotFoundException("could not find {} after {} position".format(endTag, start))
    return contents[start + len(startTag):end]

def findData(contents, start, prefix):
    dataStart = contents.find(prefix, start)
    if dataStart == -1:
        return None
    dataEnd = contents.find('"', dataStart)
    if dataEnd == -1:
        return None
    return contents[dataStart+len(prefix):dataEnd]

def GetMerriamWebsterAttributes(contents):
    startTag = '<div class="word-attributes">'
    endTag = '</div>'
    attributes = FindDataBetween(contents, startTag, endTag)
    if not attributes:
        raise endpoints.NotFoundException("could not find data between {} and {}".format(startTag, endTag))
    return attributes

def GetMerriamWebsterDefinition(contents):
    startTag = '<div class="card-primary-content">'
    endTag = '</div>'
    definition = FindDataBetween(contents, startTag, endTag)
    if not definition:
        raise endpoints.NotFoundException("could not find data between {} and {}".format(startTag, endTag))
    return definition

@ndb.tasklet
def GetWordnikDefinition(word):
    url = "http://api.wordnik.com:80/v4/word.json/{}/definitions?limit=200&includeRelated=false&useCanonical=false&includeTags=false&api_key={}".format(word, _WORDNIK_API_KEY)
    context = ndb.get_context()
    result = yield context.urlfetch(url)
    # result = urlfetch.fetch(url)
    if result.status_code != 200:
        raise endpoints.NotFoundException("Bad status code {} when trying to get definitions for word {}: {}".format(result.status_code, word, result.content))
    raise ndb.Return(json.decode(result.content))

@ndb.tasklet
def GetMerriamWebsterAudioLink(word):
    url = "https://www.merriam-webster.com/dictionary/{}".format(word)
    context = ndb.get_context()
    result = yield context.urlfetch(url)
    # result = urlfetch.fetch(url)
    if result.status_code != 200:
        raise endpoints.NotFoundException("urlfetch return error. code: {}, content: {}".format(result.status_code, result.content))
    contents = result.content
    contents = re.sub(r'[^\x00-\x7f]',r'', contents)
    audioPrefix = 'a class="play-pron"'
    start = contents.find(audioPrefix)
    if start == -1:
        raise endpoints.NotFoundException("could not find {}".format(audioPrefix))
    start_tag = 'data-file="'
    end_tag = '"'
    file_name = FindDataBetween(contents, start_tag, end_tag, start)
    if not file_name:
        raise endpoints.NotFoundException("could not find data between {} and {}".format(start_tag, end_tag))
    start_tag = 'data-dir="'
    end_tag = '"'
    file_dir = FindDataBetween(contents, start_tag, end_tag, start)
    if not file_dir:
        raise endpoints.NotFoundException("could not find data between {} and {}".format(start_tag, end_tag))
    raise ndb.Return("https://media.merriam-webster.com/audio/prons/en/us/mp3/{}/{}.mp3".format(file_dir, file_name))


def URLExists(url):
    if not url:
        return False
    try:
        result = urlfetch.fetch(url=url, method=urlfetch.HEAD, deadline=10)
        return (result.status_code == 200)
    except urlfetch.Error:
        return False
    return False

class AudioType(messages.Enum):
    MP3 = 1
    WAV = 2
    YOUTUBE = 3

class Audio(ndb.Model):
    """A single audio pronunciaton link."""
    link = ndb.StringProperty()
    type = msgprop.EnumProperty(AudioType)
    source = ndb.StringProperty()

class Word(ndb.Model):
    """A single word entry."""
    word = ndb.StringProperty()
    audio = ndb.StructuredProperty(Audio, repeated=True)
    partsOfSpeech = ndb.StringProperty(repeated=True)
    definitions = ndb.StringProperty(repeated=True)

    @classmethod
    @ndb.transactional_async
    def Add(cls, word, **attributes):
        """Add a new word."""
        entity = Word.get_by_id(word)
        if entity:
            return "word {} already exists".format(word)
        entity = Word(id=word, word=word)
        for key, value in attributes.items():
            setattr(entity, key, value)
        entity.put()
        return None

    @classmethod
    @ndb.transactional_async
    def Update(cls, word, **attributes):
        """Update or Add a new word."""
        entity = Word.get_by_id(word)
        if not entity:
            entity = Word(id=word, word=word)
        for key, value in attributes.items():
            setattr(entity, key, value)
        entity.put()
        return None

    @classmethod
    @ndb.transactional_async
    def AddAudio(cls, word, source, link):
        """Add a new audio link for a word."""
        entity = Word.get_by_id(word)
        if not entity:
            return "word {} does not exist".format(word)

        entity.audio.append(Audio(source=source, link=link))
        entity.put()
        return None

    @classmethod
    @ndb.transactional_async
    def Remove(cls, word):
        """Remove a word."""
        entity = Word.get_by_id(word)
        if not entity:
            return "word {} does not exist".format(word)
        entity.key.delete()
        return None

    @classmethod
    def List(cls):
        """Gets the list of word lists."""
        return Word.query().fetch_async()

    @classmethod
    @ndb.tasklet
    def GetWordData(cls, word):
        """Gets the information from merriam webster."""
        audio_link, items = yield GetMerriamWebsterAudioLink(word), GetWordnikDefinition(word)
        # audio_link_future = GetMerriamWebsterAudioLink(word)
        # items_future = GetWordnikDefinition(word)
        # audio_link = audio_link_future.get_result()
        # items = items_future.get_result()
        audio = []
        audio.append(Audio(link=audio_link, source="MerriamWebster", type=AudioType.MP3))
        partsOfSpeech = set()
        definitions = []
        for item in items:
            partsOfSpeech.add(item["partOfSpeech"])
            definitions.append(item["text"])
        message = yield Word.Update(word, audio=audio, definitions=definitions, partsOfSpeech=partsOfSpeech)
        if message:
            raise endpoints.InternalServerErrorException("Error adding word {}: {}".format(word, message))
        raise ndb.Return({
            "error": False,
            "message": "success",
            "audio": audio_link,
            "definitions": definitions,
            "partsOfSpeech": list(partsOfSpeech),
        })

class AddHandler(webapp2.RequestHandler):
  """Add a new word."""
  def post(self):
    word = self.request.get("word", '')
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    if not word:
        obj = {
            "error": True,
            "message": "No word was specified"
        }
        self.response.write(json.encode(obj))
        return
    message = Word.Add(word).get_result()
    if message:
        obj = {
            "error": True,
            "message": "Error adding word {}: {}".format(word, message)
        }
    else:
        obj = {
            "error": False,
            "message": "Successfully added word {}".format(word)
        }
    self.response.write(json.encode(obj))

class AddAudioHandler(webapp2.RequestHandler):
  """Adds a audio to a word."""
  def post(self):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    word = self.request.get("word", '')
    if not word:
        obj = {
            "error": True,
            "message": "No word was specified"
        }
        self.response.write(json.encode(obj))
        return
    source = self.request.get("source", '')
    if not source:
        obj = {
            "error": True,
            "message": "No audio source was specified"
        }
        self.response.write(json.encode(obj))
        return
    link = self.request.get("link", '')
    if not link:
        obj = {
            "error": True,
            "message": "No audio link was specified"
        }
        self.response.write(json.encode(obj))
        return
    message = Word.AddAudio(word, source, link).get_result()
    if message:
        obj = {
            "error": True,
            "message": "Error adding audio with source {} and link {} to word {}: {}".format(source, link, word, message)
        }
    else:
        obj = {
            "error": False,
            "message": "Successfully added audio with source {} and link {} to word {}".format(source, link, word)
        }
    self.response.write(json.encode(obj))

class RemoveHandler(webapp2.RequestHandler):
  """Removes a word."""
  def post(self):
    word = self.request.get("word", '')
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    if not word:
        obj = {
            "error": True,
            "message": "No word was specified"
        }
        self.response.write(json.encode(obj))
        return
    message = Word.Remove(word).get_result()
    if message:
        obj = {
            "error": True,
            "message": "Error removing word {}: {}".format(word, message)
        }
    else:
        obj = {
            "error": False,
            "message": "Successfully removed word {}".format(word)
        }
    self.response.write(json.encode(obj))

class ListHandler(webapp2.RequestHandler):
  """Get the list of words."""
  def get(self):
    entries = Word.List().get_result()
    words = []
    for entry in entries:
        word = {
            "word": entry.word,
            "audio": []
        }
        for audio in entry.audio:
            word["audio"].append({
                "source": audio.source,
                "link": audio.link,
            })
        words.append(word)

    obj = {
        "error": False,
        "words": words
    }
    self.response.write(json.encode(obj))

class GetWordDataHandler(webapp2.RequestHandler):
  """Gets merriam webster data from word."""
  def get(self):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    words = self.request.get("words", '')
    if not words:
        obj = {
            "error": True,
            "message": "No words were specified"
        }
    else:
        futures = {}
        wordsArray = words.split(',')
        foundWords = []
        notFoundWords = []
        for word in wordsArray:
            futures[word] = Word.GetWordData(word)
        for word in futures:
            try:
                futures[word].get_result()
                foundWords.append(word)
            except Exception as e:
                notFoundWords.append(word)
        # ndb.Future.wait_all(futures)
        obj = {
            "error": False,
            "message": "{} words found: {}/n{} words not found: {}".format(len(foundWords), ','.join(foundWords), len(notFoundWords), ','.join(notFoundWords))
        }
    self.response.write(json.encode(obj))

# [START app]
app = webapp2.WSGIApplication([
    ('/word/add', AddHandler),
    ('/word/add-audio', AddAudioHandler),
    ('/word/remove', RemoveHandler),
    ('/word/list', ListHandler),
    ('/word/get-data', GetWordDataHandler),
], debug=True)
# [END app]
