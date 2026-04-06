from django.contrib import admin

from .models import Board, BoardInvite, BoardMembership, Page

admin.site.register(Board)
admin.site.register(BoardMembership)
admin.site.register(Page)
admin.site.register(BoardInvite)
