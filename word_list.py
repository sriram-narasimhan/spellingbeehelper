import endpoints
import webapp2
from webapp2_extras import json

from google.appengine.api import urlfetch
from google.appengine.ext import ndb

from word import Word

_WORDNIK_API_KEY = "a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5"

class WordList(ndb.Model):
    """A single wordlist entry."""
    name = ndb.StringProperty()
    words = ndb.StringProperty(repeated=True)
    numWords = ndb.IntegerProperty()

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

class GetWordnikListsHandler(webapp2.RequestHandler):
  """Get lists from wordnik."""
  def get(self):
    # Authenticate with wordnik
    username = "deepasriram"
    password = "sunshine"
    url = "http://api.wordnik.com:80/v4/account.json/authenticate/{}?password={}&api_key={}".format(username, password, _WORDNIK_API_KEY)
    result = urlfetch.fetch(url)
    if result.status_code != 200:
        raise endpoints.UnauthorizedException("Bad status code {} when trying to authenticate with wordnik: {}".format(result.status_code, result.content))
    authToken = json.decode(result.content)["token"]
    # Get word lists from wordnik
    url = "http://api.wordnik.com:80/v4/account.json/wordLists?api_key={}&auth_token={}".format(_WORDNIK_API_KEY, authToken)
    result = urlfetch.fetch(url)
    if result.status_code != 200:
        raise endpoints.UnauthorizedException("Bad status code {} when trying to get wordlists from wordnik {}: {}".format(result.status_code, permalink, result.content))

    # Get and add all wordlists in parallel
    items = json.decode(result.content)
    futures = {}
    for item in items:
        name = item["name"]
        permalink = item["permalink"]
        futures[name] = WordList.AddWordnikList(authToken, name, permalink)
    for name in futures:
        try:
            numWords = futures[name].get_result()
            self.response.write("<p>successfully added wordlist {} with {} words</p>".format(name, numWords))
        except Exception as e:
            self.response.write("<p>failed to add wordlist {}: {}</p>".format(name, e))
    self.response.write("<h1>Done</h1>")

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

# [START app]
app = webapp2.WSGIApplication([
    ('/wordlist/add-list', AddListHandler),
    ('/wordlist/remove-list', RemoveListHandler),
    ('/wordlist/get-lists', GetListsHandler),
    ('/wordlist/add-words', AddWordsHandler),
    ('/wordlist/remove-words', RemoveWordsHandler),
    ('/wordlist/get-words', GetWordsHandler),
    ('/wordlist/get-wordnik-lists', GetWordnikListsHandler),
    ('/wordlist/get-merriam-audio', GetMerriamAudioHandler),
    ('/wordlist/get-wordnik-data', GetWordnikDataHandler),
    ('/wordlist/get-google-audio', GetGoogleAudioHandler),
], debug=True)
# [END app]
