select author, kind, body, created_at
from muse_messages
order by created_at desc
limit 3;
