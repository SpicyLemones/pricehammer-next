INSERT INTO chattergrounds_stats (
  broadcaster_id, chatter_id, name, messages_sent, times_banned, 
  times_timed_out, months_subbed, quests_completed, toadcoins, xp, 
  donos_gifted, is_subscriber, sub_tier, last_message, estimated_age, 
  favorite_word, favorite_emote
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  :isSub, :subTier, ?, ?, ?, ?
)
ON CONFLICT(broadcaster_id, chatter_id) DO UPDATE SET
  messages_sent = messages_sent + excluded.messages_sent,
  times_banned = times_banned + excluded.times_banned,
  times_timed_out = times_timed_out + excluded.times_timed_out,
  months_subbed = MAX(months_subbed, excluded.months_subbed),
  quests_completed = quests_completed + excluded.quests_completed,
  toadcoins = toadcoins + excluded.toadcoins,
  xp = xp + excluded.xp,
  donos_gifted = donos_gifted + excluded.donos_gifted,
  -- Use EXCLUDED to get the value passed to the INSERT section
  is_subscriber = excluded.is_subscriber,
  sub_tier = COALESCE(excluded.sub_tier, chattergrounds_stats.sub_tier),
  last_message = COALESCE(excluded.last_message, last_message),
  updated_at = CURRENT_TIMESTAMP;