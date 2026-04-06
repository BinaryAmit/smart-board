from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .models import Board, BoardMembership


class BoardConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        self.board_id = int(self.scope["url_route"]["kwargs"]["board_id"])
        allowed = await self._is_member(user.id, self.board_id)
        if not allowed:
            await self.close(code=4403)
            return

        self.group_name = f"board_{self.board_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "payload": {"board_id": self.board_id}})

    async def disconnect(self, close_code):
        group_name = getattr(self, "group_name", None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def board_event(self, event):
        await self.send_json({"event": event.get("event"), "payload": event.get("payload", {})})

    @database_sync_to_async
    def _is_member(self, user_id: int, board_id: int) -> bool:
        if Board.objects.filter(id=board_id, owner_id=user_id).exists():
            return True
        return BoardMembership.objects.filter(board_id=board_id, user_id=user_id).exists()
