import webapp2
from webapp2_extras import json
from google.appengine.api import urlfetch

class URLExistsHandler(webapp2.RequestHandler):
  """Check if url exists."""
  def get(self):
    url = self.request.get('url', '')
    exists = False
    if url:
        result = urlfetch.fetch(url=url, method=urlfetch.HEAD, deadline=10)
        if result.status_code == 200:
            exists = True
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.content_type = 'application/json'
    obj = {
        'url': url,
        'exists': exists,
      }
    self.response.write(json.encode(obj))

# [START app]
app = webapp2.WSGIApplication([
    ('/urlexists', URLExistsHandler),
], debug=True)
# [END app]
