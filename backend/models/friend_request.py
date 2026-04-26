"""
FriendRequest model.

Backs the friend-requests system. A request is created when one member
asks to befriend another (status="pending"). The recipient can then
accept (status="accepted") or reject (status="rejected"). Friendship is
mutual: a member's friends list is computed by querying every accepted
request that has them on either side.

Either party can "unfriend" by deleting the accepted row.

Columns
-------
* ``from_id`` ........ requester
* ``to_id`` .......... recipient
* ``status`` ......... ``pending`` | ``accepted`` | ``rejected``
* ``created_at`` ..... when the request was made
* ``responded_at`` ... when the recipient accepted/rejected (nullable)
"""
from datetime import datetime

from extensions import db


class FriendRequest(db.Model):
    __tablename__ = "friend_requests"

    id            = db.Column(db.Integer, primary_key=True)
    from_id       = db.Column(
        db.Integer,
        db.ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    to_id         = db.Column(
        db.Integer,
        db.ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status        = db.Column(db.String(16), nullable=False, default="pending")
    created_at    = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    responded_at  = db.Column(db.DateTime)

    def to_dict(self):
        return {
            "id":          self.id,
            "fromId":      self.from_id,
            "toId":        self.to_id,
            "status":      self.status,
            "createdAt":   self.created_at.isoformat() if self.created_at else None,
            "respondedAt": self.responded_at.isoformat() if self.responded_at else None,
        }
