from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Board, BoardInvite, BoardMembership, Page

User = get_user_model()


class UserLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email")


class BoardMembershipSerializer(serializers.ModelSerializer):
    user = UserLiteSerializer(read_only=True)

    class Meta:
        model = BoardMembership
        fields = ("id", "user", "role", "joined_at")


class PageSerializer(serializers.ModelSerializer):
    order = serializers.IntegerField(required=False)

    class Meta:
        model = Page
        fields = (
            "id",
            "order",
            "page_type",
            "pdf_page_number",
            "pdf_source_url",
            "drawing_data",
        )


class BoardSerializer(serializers.ModelSerializer):
    owner = UserLiteSerializer(read_only=True)
    memberships = BoardMembershipSerializer(many=True, read_only=True)

    class Meta:
        model = Board
        fields = ("id", "title", "owner", "created_at", "updated_at", "memberships")


class BoardDetailSerializer(BoardSerializer):
    pages = PageSerializer(many=True, read_only=True)

    class Meta(BoardSerializer.Meta):
        fields = BoardSerializer.Meta.fields + ("pages",)


class BoardCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Board
        fields = ("id", "title")


class BoardInviteSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardInvite
        fields = ("id", "email", "role", "created_at")
        read_only_fields = ("id", "created_at")


class BoardPDFUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
