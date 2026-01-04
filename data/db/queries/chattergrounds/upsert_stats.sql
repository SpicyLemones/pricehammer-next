INSERT INTO chattergrounds_stats (
  broadcaster_id,
  chatter_id,
  name,
  messages_sent,
  times_banned,
  times_timed_out,
  months_subbed,
  quests_completed,
  toadcoins,
  xp,
  donos_gifted,
  is_subscriber,
  sub_tier,
  last_message,
  estimated_age,
  favorite_word,
  favorite_emote
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  -- is_subscriber_insert: if -1 (ignore), store 0 for new rows
  CASE WHEN ? < 0 THEN 0 ELSE ? END,
  ?,
  ?, ?, ?, ?
)
ON CONFLICT(broadcaster_id, chatter_id) DO UPDATE SET
  messages_sent = messages_sent + excluded.messages_sent,
  times_banned = times_banned + excluded.times_banned,
  times_timed_out = times_timed_out + excluded.times_timed_out,

  -- keep the highest observed cumulative months
  months_subbed = MAX(months_subbed, excluded.months_subbed),

  quests_completed = quests_completed + excluded.quests_completed,

  toadcoins = toadcoins + excluded.toadcoins,
  xp = xp + excluded.xp,

  -- gifted subs accumulate
  donos_gifted = donos_gifted + excluded.donos_gifted,

  -- is_subscriber_update uses the raw params at the end of the statement (NOT excluded)
  is_subscriber = CASE 
    WHEN ? < 0 THEN IFNULL(is_subscriber, 0) 
    ELSE CAST(? AS INTEGER) 
  END,

  -- keep tier if we got one; otherwise preserve existing
  sub_tier = COALESCE(excluded.sub_tier, sub_tier),

  last_message = COALESCE(excluded.last_message, last_message),
  updated_at = CURRENT_TIMESTAMP;
