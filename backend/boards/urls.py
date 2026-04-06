from django.urls import include, path
from rest_framework import routers

from .views import BoardPDFUploadView, BoardPageListCreateView, BoardViewSet, PageDrawingView

router = routers.SimpleRouter()
router.register(r"boards", BoardViewSet, basename="boards")

urlpatterns = [
    path("", include(router.urls)),
    path("boards/<int:board_id>/pages/", BoardPageListCreateView.as_view(), name="board-pages"),
    path("boards/<int:board_id>/upload-pdf/", BoardPDFUploadView.as_view(), name="board-upload-pdf"),
    path("pages/<int:pk>/drawing/", PageDrawingView.as_view(), name="page-drawing"),
]
