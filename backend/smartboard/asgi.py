import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "smartboard.settings")

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

from boards.ws_auth import QueryStringJWTAuthMiddlewareStack
from smartboard.routing import urlpatterns as websocket_urlpatterns

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter(
	{
		"http": django_asgi_app,
		"websocket": QueryStringJWTAuthMiddlewareStack(
			URLRouter(websocket_urlpatterns)
		),
	}
)
