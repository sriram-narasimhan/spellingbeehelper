import endpoints
import webapp2
from webapp2_extras import json

from google.appengine.api import urlfetch
from google.appengine.ext import ndb

_WORDNIK_API_KEY = "a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5"

class WordList(ndb.Model):
    """A single wordlist entry."""
    name = ndb.StringProperty()
    words = ndb.StringProperty(repeated=True)

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
            return "word list {} already exists".format(word_list)
        entity = WordList(id=word_list, name=word_list, words=set(words))
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

    def ListWords(self):
        """Gets the list of words from a word list."""
        return self.words

class GetWordnikListsHandler(webapp2.RequestHandler):
  """Get lists from wordnik."""
  def get(self):
    word_list = self.request.get("name", '')
    permalink = self.request.get("permalink", '')
    if not word_list:
        raise endpoints.BadRequestException("No wordlist name specified")
    if not permalink:
        raise endpoints.BadRequestException("No permalink specified")
    if WordList.Has(word_list):
        raise endpoints.ForbiddenException("Wordlist {} already exists".format(word_list))
    # Authenticate with wordnik
    username = "deepasriram"
    password = "sunshine"
    url = "http://api.wordnik.com:80/v4/account.json/authenticate/{}?password={}&api_key={}".format(username, password, _WORDNIK_API_KEY)
    result = urlfetch.fetch(url)
    if result.status_code == 200:
        auth_token = json.decode(result.content)["token"]
    else:
        raise endpoints.UnauthorizedException("Bad status code {} from wordnik authentication: {}".format(result.status_code, result.content))

    # Get words from wordnik
    url = "http://api.wordnik.com:80/v4/wordList.json/{}/words?api_key={}&auth_token={}".format(permalink, _WORDNIK_API_KEY, auth_token)
    result = urlfetch.fetch(url)
    if result.status_code != 200:
        raise endpoints.UnauthorizedException("Bad status code {} when trying to get words for permalink {}: {}".format(result.status_code, permalink, result.content))

    words = []
    for item in json.decode(result.content):
        words.append(item["word"])
    message = WordList.Add(word_list, words).get_result()
    if message:
        raise endpoints.InternalServerErrorException(message)
    self.response.write("Successfully added new word list {} with {} words".format(word_list, len(words)))

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
    entries = WordList.List().get_result()
    names = []
    for entry in entries:
        names.append(entry.name)
    obj = {
        "error": False,
        "names": names
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
        obj = {
            "error": True,
            "message": "No word list name was specified"
        }
        self.response.write(json.encode(obj))
        return
    entry = WordList.Get(word_list).get_result()
    if not entry:
        obj = {
            "error": True,
            "message": "Cannot find word list with name {}".format(word_list)
        }
        self.response.write(json.encode(obj))
        return
    words = []
    for word in entry.ListWords():
        words.append(word)
    obj = {
        "error": False,
        "words": words
    }
    self.response.write(json.encode(obj))

# [START app]
app = webapp2.WSGIApplication([
    ('/wordlist/add-list', AddListHandler),
    ('/wordlist/remove-list', RemoveListHandler),
    ('/wordlist/get-lists', GetListsHandler),
    ('/wordlist/add-words', AddWordsHandler),
    ('/wordlist/remove-words', RemoveWordsHandler),
    ('/wordlist/get-words', GetWordsHandler),
    ('/wordlist/get-wordnik-lists', GetWordnikListsHandler),
], debug=True)
# [END app]
