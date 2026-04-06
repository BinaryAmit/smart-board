# Generated manually for initial project scaffold.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Board",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "owner",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="owned_boards", to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.CreateModel(
            name="Page",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("order", models.PositiveIntegerField()),
                (
                    "page_type",
                    models.CharField(choices=[("pdf", "PDF"), ("blank", "Blank")], default="blank", max_length=20),
                ),
                ("pdf_page_number", models.PositiveIntegerField(blank=True, null=True)),
                ("pdf_source_url", models.URLField(blank=True, default="")),
                ("drawing_data", models.JSONField(blank=True, default=dict)),
                (
                    "board",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="pages", to="boards.board"),
                ),
            ],
            options={"ordering": ["order"], "unique_together": {("board", "order")}},
        ),
        migrations.CreateModel(
            name="BoardMembership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "role",
                    models.CharField(choices=[("editor", "Editor"), ("viewer", "Viewer")], default="editor", max_length=20),
                ),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                (
                    "board",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="boards.board"),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="board_memberships", to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={"unique_together": {("board", "user")}},
        ),
        migrations.CreateModel(
            name="BoardInvite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(max_length=254)),
                (
                    "role",
                    models.CharField(choices=[("editor", "Editor"), ("viewer", "Viewer")], default="editor", max_length=20),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "board",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="invites", to="boards.board"),
                ),
                (
                    "invited_by",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={"unique_together": {("board", "email")}},
        ),
    ]
