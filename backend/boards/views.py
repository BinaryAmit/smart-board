import os
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.core.files.storage import default_storage
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from pypdf import PdfReader

from .models import Board, BoardInvite, BoardMembership, Page
from .permissions import CanEditBoard, IsBoardMember
from .realtime import broadcast_board_event
from .serializers import (
    BoardCreateSerializer,
    BoardDetailSerializer,
    BoardInviteSerializer,
    BoardPDFUploadSerializer,
    BoardSerializer,
    PageSerializer,
)

User = get_user_model()


class BoardViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsBoardMember]

    def get_queryset(self):
        return Board.objects.filter(
            Q(owner=self.request.user) | Q(memberships__user=self.request.user)
        ).distinct().prefetch_related("memberships__user", "pages")

    def get_serializer_class(self):
        if self.action == "create":
            return BoardCreateSerializer
        if self.action == "retrieve":
            return BoardDetailSerializer
        return BoardSerializer

    def perform_create(self, serializer):
        board = serializer.save(owner=self.request.user)
        Page.objects.create(board=board, order=0, page_type=Page.TYPE_BLANK)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        board = Board.objects.select_related("owner").prefetch_related("memberships__user").get(id=serializer.instance.id)
        output = BoardSerializer(board, context=self.get_serializer_context())
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, CanEditBoard])
    def invite(self, request, pk=None):
        board = self.get_object()
        serializer = BoardInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        invite, _ = BoardInvite.objects.update_or_create(
            board=board,
            email=serializer.validated_data["email"],
            defaults={
                "role": serializer.validated_data["role"],
                "invited_by": request.user,
            },
        )

        target_user = User.objects.filter(email__iexact=invite.email).first()
        if target_user:
            BoardMembership.objects.update_or_create(
                board=board,
                user=target_user,
                defaults={"role": invite.role},
            )

        broadcast_board_event(
            board.id,
            "board_members_updated",
            {"board_id": board.id, "email": invite.email, "role": invite.role},
        )

        return Response(BoardInviteSerializer(invite).data, status=status.HTTP_201_CREATED)


class BoardPageListCreateView(generics.ListCreateAPIView):
    serializer_class = PageSerializer
    permission_classes = [permissions.IsAuthenticated, IsBoardMember]

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAuthenticated(), CanEditBoard()]
        return [permissions.IsAuthenticated(), IsBoardMember()]

    def get_queryset(self):
        board = generics.get_object_or_404(Board, id=self.kwargs["board_id"])
        self.check_object_permissions(self.request, board)
        return Page.objects.filter(board=board)

    def perform_create(self, serializer):
        board = generics.get_object_or_404(Board, id=self.kwargs["board_id"])
        self.check_object_permissions(self.request, board)
        max_order = Page.objects.filter(board=board).order_by("-order").values_list("order", flat=True).first()
        next_order = 0 if max_order is None else max_order + 1
        page = serializer.save(board=board, order=next_order)
        broadcast_board_event(
            board.id,
            "page_created",
            {"board_id": board.id, "page_id": page.id, "order": page.order},
        )


class BoardPDFUploadView(generics.CreateAPIView):
    serializer_class = BoardPDFUploadSerializer
    permission_classes = [permissions.IsAuthenticated, CanEditBoard]
    parser_classes = [MultiPartParser]

    def post(self, request, *args, **kwargs):
        board = generics.get_object_or_404(Board, id=self.kwargs["board_id"])
        self.check_object_permissions(request, board)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_file = serializer.validated_data["file"]

        if not uploaded_file.name.lower().endswith(".pdf"):
            return Response({"detail": "Only PDF files are allowed."}, status=400)

        _, ext = os.path.splitext(uploaded_file.name)
        safe_ext = ext.lower() if ext else ".pdf"
        unique_name = f"{uuid4().hex}{safe_ext}"
        path = default_storage.save(os.path.join("pdfs", unique_name), uploaded_file)
        media_path = path.replace("\\", "/")
        absolute_url = request.build_absolute_uri(f"{settings.MEDIA_URL}{media_path}")

        full_path = os.path.join(settings.MEDIA_ROOT, path)
        try:
            reader = PdfReader(full_path)
            total_pages = len(reader.pages)
        except Exception:
            default_storage.delete(path)
            return Response({"detail": "Unable to parse PDF file."}, status=400)

        max_order = Page.objects.filter(board=board).order_by("-order").values_list("order", flat=True).first()
        next_order = 0 if max_order is None else max_order + 1

        created_pages = []
        for i in range(total_pages):
            page = Page.objects.create(
                board=board,
                order=next_order + i,
                page_type=Page.TYPE_PDF,
                pdf_page_number=i + 1,
                pdf_source_url=absolute_url,
                drawing_data={},
            )
            created_pages.append(page)

        broadcast_board_event(
            board.id,
            "pdf_uploaded",
            {"board_id": board.id, "count": len(created_pages)},
        )

        return Response(PageSerializer(created_pages, many=True).data, status=status.HTTP_201_CREATED)


class PageDrawingView(generics.UpdateAPIView):
    serializer_class = PageSerializer
    permission_classes = [permissions.IsAuthenticated, CanEditBoard]
    queryset = Page.objects.select_related("board")

    def patch(self, request, *args, **kwargs):
        page = self.get_object()
        self.check_object_permissions(request, page)

        drawing_data = request.data.get("drawing_data", {})
        if not isinstance(drawing_data, (dict, list)):
            return Response({"detail": "drawing_data must be JSON object or array"}, status=400)

        page.drawing_data = drawing_data
        page.save(update_fields=["drawing_data"])

        broadcast_board_event(
            page.board_id,
            "drawing_updated",
            {"board_id": page.board_id, "page_id": page.id},
        )

        return Response(PageSerializer(page).data)
