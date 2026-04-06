from django.conf import settings
from django.db import models


class Board(models.Model):
    title = models.CharField(max_length=200)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_boards",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title


class BoardMembership(models.Model):
    ROLE_EDITOR = "editor"
    ROLE_VIEWER = "viewer"
    ROLE_CHOICES = [
        (ROLE_EDITOR, "Editor"),
        (ROLE_VIEWER, "Viewer"),
    ]

    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="board_memberships")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_EDITOR)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("board", "user")


class Page(models.Model):
    TYPE_PDF = "pdf"
    TYPE_BLANK = "blank"
    TYPE_CHOICES = [
        (TYPE_PDF, "PDF"),
        (TYPE_BLANK, "Blank"),
    ]

    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="pages")
    order = models.PositiveIntegerField()
    page_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_BLANK)
    pdf_page_number = models.PositiveIntegerField(null=True, blank=True)
    pdf_source_url = models.URLField(blank=True, default="")
    drawing_data = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["order"]
        unique_together = ("board", "order")


class BoardInvite(models.Model):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="invites")
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=BoardMembership.ROLE_CHOICES, default=BoardMembership.ROLE_EDITOR)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("board", "email")
