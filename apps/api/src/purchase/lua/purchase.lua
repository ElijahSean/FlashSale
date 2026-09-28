--[[
  The purchase gate. The only place stock goes down (rule 1).

  Why Lua: Redis runs a whole script before any other command.
  So no other buyer can sneak in between "check stock" and "take one".
  Without this, two buyers could both see "1 left" and both take it. That is an oversell.

  KEYS[1] = sale:config  (startsAt, endsAt in ms)
  KEYS[2] = sale:stock   (units left)
  KEYS[3] = sale:buyers  (users who got one)
  ARGV[1] = userId

  Returns SUCCESS, ALREADY_PURCHASED, SOLD_OUT, NOT_STARTED or ENDED.
  Only this answer decides a purchase (rule 3).
]]

-- Use Redis's clock, not the API's (rule 9). TIME gives {seconds, microseconds}.
local t = redis.call('TIME')
-- Turn it into milliseconds, like the stored times.
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local startsAt = tonumber(redis.call('HGET', KEYS[1], 'startsAt'))
local endsAt = tonumber(redis.call('HGET', KEYS[1], 'endsAt'))
-- No sale set up. Return an error; the API turns it into 503.
if not startsAt or not endsAt then
  return redis.error_reply('SALE_NOT_CONFIGURED')
end

-- Open from startsAt (included) until endsAt (not included).
if now < startsAt then
  return 'NOT_STARTED'
end
if now >= endsAt then
  return 'ENDED'
end

-- One per user (rule 2). Checked before stock, so a buyer who returns
-- after sell-out hears "you already have one".
if redis.call('SISMEMBER', KEYS[3], ARGV[1]) == 1 then
  return 'ALREADY_PURCHASED'
end

-- No stock key counts as 0: when unsure, don't sell.
local stock = tonumber(redis.call('GET', KEYS[2]) or '0')
if stock <= 0 then
  return 'SOLD_OUT'
end

-- Take one unit and record the buyer. The script is atomic, so both happen or neither.
redis.call('DECR', KEYS[2])
redis.call('SADD', KEYS[3], ARGV[1])
return 'SUCCESS'
