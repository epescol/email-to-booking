
-- Fix orphaned data: reassign profile to original hotel and rename it
UPDATE profiles SET hotel_id = 'be39d628-78bb-4da4-995d-67720d0ee487' WHERE user_id = 'a6aeffb2-d426-427c-ae9a-aac6e220e3e7';
UPDATE hotels SET name = 'Test Hotel' WHERE id = 'be39d628-78bb-4da4-995d-67720d0ee487';
DELETE FROM hotel_languages WHERE hotel_id = '98a57bc8-3161-4d65-8ed4-89f75b22156f';
DELETE FROM hotels WHERE id = '98a57bc8-3161-4d65-8ed4-89f75b22156f';
