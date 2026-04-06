from rest_framework import permissions

from .models import Board, BoardMembership


class IsBoardMember(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        board = obj if isinstance(obj, Board) else getattr(obj, "board", None)
        if board is None:
            return False

        if board.owner_id == request.user.id:
            return True

        return BoardMembership.objects.filter(board=board, user=request.user).exists()


class CanEditBoard(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        board = obj if isinstance(obj, Board) else getattr(obj, "board", None)
        if board is None:
            return False

        if board.owner_id == request.user.id:
            return True

        membership = BoardMembership.objects.filter(board=board, user=request.user).first()
        return bool(membership and membership.role == BoardMembership.ROLE_EDITOR)
