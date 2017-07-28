import datetime
from dateutil.parser import parse
from dateutil.tz import *

import endpoints
import webapp2
from webapp2_extras import json

from google.appengine.api import memcache
from google.appengine.api import urlfetch
from google.appengine.ext import ndb

from word import Word

_WORDNIK_API_KEY = "a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5"

class WordList(ndb.Model):
    """A single wordlist entry."""
    name = ndb.StringProperty()
    words = ndb.StringProperty(repeated=True)
    numWords = ndb.IntegerProperty()
    created = ndb.model.DateTimeProperty(auto_now_add=True)
    updated = ndb.model.DateTimeProperty(auto_now=True)

    @classmethod
    def Has(cls, word_list):
        """Does the specified word list exist."""
        entity = WordList.get_by_id(word_list)
        if entity:
            return True
        return False

    @classmethod
    @ndb.transactional_async
    def Add(cls, word_list, words = []):
        """Add a new word list."""
        entity = WordList.get_by_id(word_list)
        if entity:
            raise endpoints.BadRequestException("word list {} already exists".format(word_list))
        wordSet = set(words)
        entity = WordList(id=word_list, name=word_list, words=wordSet, numWords=len(wordSet))
        entity.put()
        return None

    @classmethod
    @ndb.transactional_async
    def Update(cls, word_list, words = []):
        """Add a new word list."""
        entity = WordList.get_by_id(word_list)
        if not entity:
            entity = WordList(id=word_list, name=word_list)
        wordSet = set(words)
        entity.words = wordSet
        entity.numWords = len(wordSet)
        entity.put()
        return None

    @classmethod
    @ndb.transactional_async
    def Remove(cls, word_list):
        """Remove a word list."""
        entity = WordList.get_by_id(word_list)
        if not entity:
            return "word list {} does not exists".format(word_list)
        entity.key.delete()
        return None

    @classmethod
    def List(cls):
        """Gets the list of word lists."""
        return WordList.query().fetch_async()

    @classmethod
    def Get(cls, word_list):
        """Gets a specific word list."""
        return WordList.get_by_id_async(word_list)

    @classmethod
    @ndb.transactional_async
    def AddWords(cls, word_list, words):
        """Add words to a word_list."""
        entity = WordList.get_by_id(word_list)
        if not entity:
            return "word list {} does not exist".format(word_list)
        entity.words = list(set(entity.words) | set(words))
        entity.put()
        return None

    @classmethod
    @ndb.transactional_async
    def RemoveWords(cls, word_list, words):
        """Remove words to a word_list."""
        entity = WordList.get_by_id(word_list)
        if not entity:
            return "word list {} does not exist".format(word_list)
        entity.words = list(set(entity.words) - set(words))
        entity.put()
        return None

    def GetWords(self):
        """Gets the list of words from a word list."""
        futures = {}
        for word in self.words:
            futures[word] = Word.get_by_id_async(word)
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
                    "name": word,
                    "found": False,
                }
        return output

    @classmethod
    @ndb.tasklet
    def AddWordnikList(cls, authToken, name, permalink):
        # Get words from wordnik
        url = "http://api.wordnik.com:80/v4/wordList.json/{}/words?api_key={}&auth_token={}&limit=10000".format(permalink, _WORDNIK_API_KEY, authToken)
        context = ndb.get_context()
        result = yield context.urlfetch(url)
        if result.status_code != 200:
            raise endpoints.UnauthorizedException("Bad status code {} when trying to get words for permalink {}: {}".format(result.status_code, permalink, result.content))
        items = json.decode(result.content)
        words = set()
        for item in items:
            words.add(item["word"])
        yield WordList.Update(name, words)
        raise ndb.Return(len(words))

    @classmethod
    def GetWordData(cls, request, response, func):
        """Gets the information about a word from some source."""
        word_list = request.get("word_list", '')
        if not word_list:
            raise endpoints.BadRequestException("No word list was specified")
        entity = WordList.get_by_id(word_list)
        if not entity:
            raise endpoints.NotFoundException("Word list {} was not found".format(word_list))
        words = entity.words
        futures = {}
        foundWords = []
        notFoundWords = []
        for word in words:
            futures[word] = func(word)
        for word in futures:
            try:
                futures[word].get_result()
                foundWords.append(word)
            except Exception as e:
                notFoundWords.append(word)
                message = str(e)
                if len(message) < 100:
                    response.write("<p>error when adding word {}: {}</p>".format(word, message))
                else:
                    response.write("<p>error when adding word {}: error too big to display".format(word))
        response.write("<h1>Total Words Processed = {}</h1>".format(len(words)))
        response.write("<h2>Successfully Added = {}</h2>".format(len(foundWords)))
        response.write("<h2>Words with errors = {}</h2>".format(len(notFoundWords)))

class UpdateWordsHandler(webapp2.RequestHandler):
  """Update words from wordlists from wordnik."""
  def get(self):
    try:
        # Check memcache
        listCacheName = "word-lists"
        dateCacheName = "word-lists-last-processed"
        last_processed = memcache.get(dateCacheName)
        lists = memcache.get(listCacheName)
        messages = []
        if not lists:
            if lists is None:
                memcache.add(listCacheName, [])
            if last_processed:
                query = WordList.query(WordList.updated >= last_processed)
            else:
                query = WordList.query()
            results = query.fetch()
            lists = []
            for result in results:
                lists.append(result.name)
            memcache.replace(listCacheName, lists)
            if last_processed is None:
                memcache.add(dateCacheName, datetime.datetime.now())
            else:
                memcache.replace(dateCacheName, datetime.datetime.now())
            messages.append("retrieved and cached wordlists {}".format(lists))
        else:
            messages.append("cached wordlists {} already exist".format(lists))

        while lists:
            name = lists.pop()
            wordlist = WordList.get_by_id(name)
            if not wordlist:
                messages.append("could not find list with name {}".format(name))
            else:
                for word in wordlist.words:
                    entity = Word.get_by_id(word)
                    if not entity:
                        entity = Word(id=word, word=word)
                        entity.put()
                messages.append("added {} words for wordlist {}".format(wordlist.numWords, name))
            memcache.replace(listCacheName, lists)
    except Exception as e:
        messages.append(str(e))
    self.response.write("<br/>".join(messages))

class GetWordnikListsHandler(webapp2.RequestHandler):
  """Get lists from wordnik."""
  def get(self):
    try:
        # Authenticate with wordnik
        username = "deepasriram"
        password = "sunshine"
        url = "http://api.wordnik.com:80/v4/account.json/authenticate/{}?password={}&api_key={}".format(username, password, _WORDNIK_API_KEY)
        result = urlfetch.fetch(url)
        if result.status_code != 200:
            raise endpoints.UnauthorizedException("Bad status code {} when trying to authenticate with wordnik: {}".format(result.status_code, result.content))
        authToken = json.decode(result.content)["token"]

        # Check memcache
        listCacheName = "wordnik-lists"
        dateCacheName = "wordnik-lists-last-processed"
        lists = memcache.get(listCacheName)
        messages = []
        if not lists:
            if lists is None:
                memcache.add(listCacheName, {})
            # Get word lists from wordnik
            url = "http://api.wordnik.com:80/v4/account.json/wordLists?api_key={}&auth_token={}".format(_WORDNIK_API_KEY, authToken)
            result = urlfetch.fetch(url)
            if result.status_code != 200:
                raise endpoints.UnauthorizedException("Bad status code {} when trying to get wordlists from wordnik {}: {}".format(result.status_code, permalink, result.content))
            # Get and add all wordlists in parallel
            items = json.decode(result.content)
            lists = {}
            last_processed = memcache.get(dateCacheName)
            for item in items:
                last_activity = parse(item["lastActivityAt"])
                if not last_processed or last_activity > last_processed:
                    lists[item["permalink"]] = item["name"]
            memcache.replace("wordnik-lists", lists)
            if last_processed is None:
                memcache.add(dateCacheName, datetime.datetime.now(tzlocal()))
            else:
                memcache.replace(dateCacheName, datetime.datetime.now(tzlocal()))
            messages.append("retrieved lists {} to process".format(lists))
        else:
            messages.append("found existing lists {} to process".format(lists))
        while lists:
            permalink, name = lists.popitem()
            try:
                WordList.AddWordnikList(authToken, name, permalink).get_result()
                messages.append("Added wordlist {} successfully".format(name))
            except Exception as e:
                messages.append("Failed to add wordlist {} : {}".format(name, str(e)))
            memcache.replace(listCacheName, lists)
        self.response.write("<br/>".join(messages))
    except Exception as e:
        messages.append(str(e))

class AddListHandler(webapp2.RequestHandler):
  """Add a new word list."""
  def post(self):
    word_list = self.request.get("name", '')
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    if not word_list:
        obj = {
            "error": True,
            "message": "No word list name was specified"
        }
        self.response.write(json.encode(obj))
        return
    message = WordList.Add(word_list).get_result()
    if message:
        obj = {
            "error": True,
            "message": "Error adding wordlist with name {}: {}".format(word_list, message)
        }
    else:
        obj = {
            "error": False,
            "message": "Successfully added word list with name {}".format(word_list)
        }
    self.response.write(json.encode(obj))


class RemoveListHandler(webapp2.RequestHandler):
  """Removes a word list."""
  def post(self):
    word_list = self.request.get("name", '')
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    if not word_list:
        obj = {
            "error": True,
            "message": "No word list name was specified"
        }
        self.response.write(json.encode(obj))
        return
    message = WordList.Remove(word_list).get_result()
    if message:
        obj = {
            "error": True,
            "message": "Error removing wordlist with name {}: {}".format(word_list, message)
        }
    else:
        obj = {
            "error": False,
            "message": "Successfully removed word list with name {}".format(word_list)
        }
    self.response.write(json.encode(obj))

class GetListsHandler(webapp2.RequestHandler):
  """Get the list of word lists."""
  def get(self):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    entries = WordList.List().get_result()
    lists = {}
    for entry in entries:
        lists[entry.name] = {
            "name": entry.name,
            "words": list(entry.words),
            "numWords": entry.numWords,
        }
    obj = {
        "error": False,
        "lists": lists,
    }
    self.response.write(json.encode(obj))

class AddWordsHandler(webapp2.RequestHandler):
  """Add a new word list."""
  def post(self):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    word_list = self.request.get("name", '')
    words = self.request.get("words",'')
    if not word_list:
        obj = {
            "error": True,
            "message": "No word list name was specified"
        }
        self.response.write(json.encode(obj))
        return
    if not words:
        obj = {
            "error": True,
            "message": "No words were specified"
        }
        self.response.write(json.encode(obj))
        return
    message = WordList.AddWords(word_list, words.split(',')).get_result()
    if message:
        obj = {
            "error": True,
            "message": "Error adding words {} to word list with name {}: {}".format(words, word_list, message)
        }
    else:
        obj = {
            "error": False,
            "message": "Successfully added words {} to word list with name {}".format(words, word_list)
        }
    self.response.write(json.encode(obj))


class RemoveWordsHandler(webapp2.RequestHandler):
  """Removes a word list."""
  def post(self):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    word_list = self.request.get("name", '')
    words = self.request.get("words",'')
    if not word_list:
        obj = {
            "error": True,
            "message": "No word list name was specified"
        }
        self.response.write(json.encode(obj))
        return
    if not words:
        obj = {
            "error": True,
            "message": "No words were specified"
        }
        self.response.write(json.encode(obj))
        return
    message = WordList.RemoveWords(word_list, words.split(',')).get_result()
    if message:
        obj = {
            "error": True,
            "message": "Error removing words {} from word list with name {}: {}".format(words, word_list, message)
        }
    else:
        obj = {
            "error": False,
            "message": "Successfully removed words {} from word list with name {}".format(words, word_list)
        }
    self.response.write(json.encode(obj))

class GetWordsHandler(webapp2.RequestHandler):
  """Get words in a word list."""
  def get(self):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    word_list = self.request.get("name", '')
    if not word_list:
        raise endpoints.BadRequestException("No word list name was specified")
    entry = WordList.Get(word_list).get_result()
    if not entry:
        raise endpoints.NotFoundException("Cannot find word list with name {}".format(word_list))
    self.response.write(json.encode(entry.GetWords()))

class GetMerriamAudioHandler(webapp2.RequestHandler):
  """Gets merriam webster audio for a list of words."""
  def get(self):
      WordList.GetWordData(self.request, self.response, Word.AddMerriamWebsterAudioLink)

class GetWordnikDataHandler(webapp2.RequestHandler):
  """Gets wordnik data for a list of words."""
  def get(self):
      WordList.GetWordData(self.request, self.response, Word.AddWordnikDefinition)

class GetGoogleAudioHandler(webapp2.RequestHandler):
  """Gets google audio for a list of words."""
  def get(self):
      WordList.GetWordData(self.request, self.response, Word.AddGoogleAudio)

class GetDictionaryComAudioHandler(webapp2.RequestHandler):
  """Gets DictionaryCom audio for a list of words."""
  def get(self):
      word = self.request.get("word", '')
      if not word:
          self.response.write("no word specified")
          return
      link = Word.AddDictionaryComAudioLink(word).get_result()
      self.response.write(link)
      # WordList.GetWordData(self.request, self.response, Word.AddDictionaryComAudio)

# [START app]
app = webapp2.WSGIApplication([
    ('/wordlist/add-list', AddListHandler),
    ('/wordlist/remove-list', RemoveListHandler),
    ('/wordlist/get-lists', GetListsHandler),
    ('/wordlist/add-words', AddWordsHandler),
    ('/wordlist/remove-words', RemoveWordsHandler),
    ('/wordlist/get-words', GetWordsHandler),
    ('/wordlist/get-wordnik-lists', GetWordnikListsHandler),
    ('/wordlist/update-words', UpdateWordsHandler),
    ('/wordlist/get-merriam-audio', GetMerriamAudioHandler),
    ('/wordlist/get-wordnik-data', GetWordnikDataHandler),
    ('/wordlist/get-google-audio', GetGoogleAudioHandler),
    ('/wordlist/get-dictionary-com-audio', GetDictionaryComAudioHandler),
], debug=True)
# [END app]
