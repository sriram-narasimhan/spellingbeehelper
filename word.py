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

@ndb.tasklet
def URLExists(url):
    if url:
        context = ndb.get_context()
        result = yield context.urlfetch(url, method=urlfetch.HEAD, deadline=1)
        raise ndb.Return(result.status_code == 200)
    raise ndb.Return(False)

class Word(ndb.Model):
    """A single word entry."""
    word = ndb.StringProperty()
    audio = ndb.StringProperty(repeated=True)
    partsOfSpeech = ndb.StringProperty(repeated=True)
    definitions = ndb.StringProperty(repeated=True)
    created = ndb.model.DateTimeProperty(auto_now_add=True)
    updated = ndb.model.DateTimeProperty(auto_now=True)

    def Update(self):
        

    @classmethod
    @ndb.transactional_async
    def Add(cls, word, **attributes):
        """Add a new word."""
        entity = Word.get_by_id(word)
        if entity:
            raise endpoints.BadRequestException("word {} already exists".format(word))
        entity = Word(id=word, word=word)
        for key, value in attributes.items():
            setattr(entity, key, value)
        entity.put()
        return None

    @classmethod
    @ndb.tasklet
    def AddWordnikDefinition(cls, word):
        entity = yield Word.get_by_id_async(word)
        if not entity:
            entity = Word(id=word, word=word)
        if entity.partsOfSpeech and entity.definitions:
            raise endpoints.ConflictException("Parts of Speech and Definitions for {} already exist so skipping".format(word))
        url = "http://api.wordnik.com:80/v4/word.json/{}/definitions?limit=200&includeRelated=false&useCanonical=false&includeTags=false&api_key={}".format(word, _WORDNIK_API_KEY)
        context = ndb.get_context()
        result = yield context.urlfetch(url, deadline=1, follow_redirects=False)
        if result.status_code != 200:
            raise endpoints.NotFoundException("Bad status code {} when trying to get definitions for word {}: {}".format(result.status_code, word, result.content))
        items = json.decode(result.content)
        if not items:
            raise endpoints.NotFoundException("No data found for {}".format(word))
        partsOfSpeech = set()
        definitions = []
        for item in items:
            if "partOfSpeech" in item:
                partsOfSpeech.add(item["partOfSpeech"])
            if "text" in item:
                definitions.append(item["text"])
        entity.partsOfSpeech = list(set(entity.partsOfSpeech).union(partsOfSpeech))
        entity.definitions = list(set(entity.definitions).union(definitions))
        yield entity.put_async()

    @classmethod
    @ndb.tasklet
    def AddGoogleAudio(cls, word):
        entity = yield Word.get_by_id_async(word)
        if not entity:
            entity = Word(id=word, word=word)
        if entity.audio:
            raise ndb.Return(True)
        url = "https://ssl.gstatic.com/dictionary/static/sounds/oxford/{}--_us_1.mp3".format(word)
        context = ndb.get_context()
        result = yield URLExists(url)
        if not result:
            url = "http://www.gstatic.com/dictionary/static/sounds/de/0/{}.mp3".format(word)
            result = yield URLExists(url)
            if not result:
                raise ndb.Return(False)
        original = set(entity.audio)
        original.add(url)
        entity.audio = list(original)
        yield entity.put_async()
        raise ndb.Return(True)

    @classmethod
    @ndb.tasklet
    def AddDictionaryComAudioLink(cls, word):
        entity = yield Word.get_by_id_async(word)
        if not entity:
            entity = Word(id=word, word=word)
        # Ignore if audio already exists
        if entity.audio:
            raise ndb.Return(True)
        url = "http://www.dictionary.com/browse/{}".format(word)
        context = ndb.get_context()
        result = yield context.urlfetch(url, deadline=1, follow_redirects=False)
        if result.status_code != 200:
            raise ndb.Return(False)
        contents = result.content
        contents = re.sub(r'[^\x00-\x7f]',r'', contents)
        audioPrefix = 'class="main-header'
        start = contents.find(audioPrefix)
        if start == -1:
            raise endpoints.NotFoundException("could not find {}".format(audioPrefix))
        start_tag = '<audio>'
        end_tag = '</audio>'
        audioTags = FindDataBetween(contents, start_tag, end_tag, start)
        if not audioTags:
            raise ndb.Return(False)
        start_tag = 'source src="'
        end_tag = '"'
        start = 0
        while True:
            try:
                file_name = FindDataBetween(audioTags, start_tag, end_tag, start)
            except Exception as e:
                print "could not find file name"
                raise ndb.Return(False)
            print "file name is ", file_name
            if not file_name:
                raise ndb.Return(False)
            start = audioTags.find(start_tag, start)
            start = start + len(start_tag)
            if file_name.endswith(".mp3"):
                link = file_name
                original = set(entity.audio)
                original.add(link)
                entity.audio = list(original)
                yield entity.put_async()
                raise ndb.Return(True)
        raise ndb.Return(False)

    @classmethod
    @ndb.tasklet
    def AddMerriamWebsterAudioLink(cls, word):
        entity = yield Word.get_by_id_async(word)
        if not entity:
            entity = Word(id=word, word=word)
        # Ignore if audio already exists
        if entity.audio:
            raise ndb.Return(True)
        url = "https://www.merriam-webster.com/dictionary/{}".format(word)
        context = ndb.get_context()
        result = yield context.urlfetch(url, deadline=1, follow_redirects=False)
        if result.status_code != 200:
            raise ndb.Return(False)
        contents = result.content
        contents = re.sub(r'[^\x00-\x7f]',r'', contents)
        audioPrefix = 'a class="play-pron"'
        start = contents.find(audioPrefix)
        if start == -1:
            raise ndb.Return(False)
        start_tag = 'data-file="'
        end_tag = '"'
        file_name = FindDataBetween(contents, start_tag, end_tag, start)
        if not file_name:
            raise ndb.Return(False)
        start_tag = 'data-dir="'
        end_tag = '"'
        file_dir = FindDataBetween(contents, start_tag, end_tag, start)
        if not file_dir:
            raise ndb.Return(False)
        link = "https://media.merriam-webster.com/audio/prons/en/us/mp3/{}/{}.mp3".format(file_dir, file_name)
        original = set(entity.audio)
        original.add(link)
        entity.audio = list(original)
        yield entity.put_async()
        raise ndb.Return(True)

    @classmethod
    @ndb.transactional_async
    def Update(cls, word, **attributes):
        """Update or Add a new word."""
        entity = Word.get_by_id(word)
        if not entity:
            raise endpoints.NotFoundException("word {} does not exist".format(word))
        for key, value in attributes.items():
            if getattr(entity, key) != value:
                if isinstance(value, list):
                    original = getattr(entity, key)
                    setattr(entity, key,list(set(value).union(set(original))))
                else:
                    setattr(entity, key, value)
        entity.put()
        return None

    @classmethod
    @ndb.transactional_async
    def AddAudio(cls, word, link):
        """Add a new audio link for a word."""
        entity = Word.get_by_id(word)
        if not entity:
            raise endpoints.NotFoundException("word {} does not exist".format(word))
        original = set(entity.audio)
        original.add(link)
        entity.audio = list(original)
        entity.put()
        return None

    @classmethod
    @ndb.transactional_async
    def Remove(cls, word):
        """Remove a word."""
        entity = Word.get_by_id(word)
        if not entity:
            raise endpoints.NotFoundException("word {} does not exist".format(word))
        entity.key.delete()
        return None

    @classmethod
    def List(cls):
        """Gets the list of word lists."""
        return Word.query().fetch_async()

    @classmethod
    def GetWords(cls, words):
        for word in words:
            futures[word] = Word.get_by_id.async()
        output = {}
        for word in futures:
            try:
                data = futures[word].get_result()
                output[word] = {
                    "name": data.word,
                    "found": True,
                    "audio": list(data.audio),
                    "partsOfSpeech": list(data.partsOfSpeech),
                    "definitions": list(data.definitions),
                }
            except Exception:
                output[word] = {
                    "name": data.word,
                    "found": False,
                }
        return output

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

# [START app]
app = webapp2.WSGIApplication([
    ('/word/add', AddHandler),
    ('/word/add-audio', AddAudioHandler),
    ('/word/remove', RemoveHandler),
    ('/word/list', ListHandler),
], debug=True)
# [END app]
