INSERT INTO chattergrounds_stats (
  broadcaster_id,
  chatter_id,
  name,
  messages_sent,
  times_banned,
  times_timed_out,
  months_subbed,
  quests_completed,
  toadcoins_minted,
  last_message, -- Ensure this is here
  estimated_age,
  favorite_word,
  favorite_emote
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(broadcaster_id, chatter_id) DO UPDATE SET
  messages_sent = messages_sent + excluded.messages_sent,
  times_banned = times_banned + excluded.times_banned,
  times_timed_out = times_timed_out + excluded.times_timed_out,
  months_subbed = MAX(months_subbed, excluded.months_subbed),
  quests_completed = quests_completed + excluded.quests_completed,
  toadcoins_minted = toadcoins_minted + excluded.toadcoins_minted,
  -- CRITICAL: Update the message text if a new one came in
  last_message = COALESCE(excluded.last_message, last_message), 
  updated_at = CURRENT_TIMESTAMP;