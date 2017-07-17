import webapp2
from webapp2_extras import json
from google.appengine.api import urlfetch
from google.appengine.ext import endpoints
from google.appengine.ext import ndb


class Audio(ndb.Model):
    """A single audio pronunciaton link."""
    link = ndb.StringProperty()
    source = ndb.StringProperty()

class Word(ndb.Model):
    """A single word entry."""
    name = ndb.StringProperty()
    audio = ndb.StructuredProperty(Audio, repeated=True)

    @classmethod
    @ndb.transactional_async
    def Add(cls, word):
        """Add a new word."""
        entity = Word.get_by_id(word)
        if entity:
            return "word {} already exists".format(word)
        entity = Word(id=word, name=word)
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
            "word": entry.name,
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

# class ShowWordHandler(webapp2.RequestHandler):
#   """Display information the requested word."""
#   def get(self):
#     word = self.request.get('word', '')
#     json_str = self.request.get('json', 'false')
#     as_json = True if json_str.lower() == 'true' else False
#     if (not word):
#         raise endpoints.BadRequestException("No word was specified")
#     entry = model.Word.get_by_id(word)
#     if (not entry):
#     else:
#         obj = {
#             'error': False.
#             'word': word,
#             'audio': entry.audio,
#         }
#     self.response.headers['Access-Control-Allow-Origin'] = '*'
#     self.response.content_type = 'application/json'
#
#     self.response.write(json.encode(obj))
#
# class UpdateWordHandler(webapp2.RequestHandler):
#   """Add or update a word."""
#   def post(self):
#     word = self.request.post('word', '')
#     audio = self.request.post('audio', '')
#     if (not word):
#         raise endpoints.BadRequestException("No word was specified")
#     self.response.headers['Access-Control-Allow-Origin'] = '*'
#     self.response.content_type = 'application/json'
#     added = model.Word.Update(word, audio=audio)
#     if added:
#         message = 'Added {} Successfully'.format(word)
#     else:
#         message = 'Updated {} Successfully'.format(word)
#     obj = {
#         'message': message
#     }
#     self.response.write(json.encode(obj))

# [START app]
app = webapp2.WSGIApplication([
    ('/word/add', AddHandler),
    ('/word/add-audio', AddAudioHandler),
    ('/word/remove', RemoveHandler),
    ('/word/list', ListHandler),
], debug=True)
# [END app]
