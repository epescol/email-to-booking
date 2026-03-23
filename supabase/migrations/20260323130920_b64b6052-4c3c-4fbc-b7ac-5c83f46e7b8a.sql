ALTER TABLE booking_requests DROP CONSTRAINT booking_requests_status_check;
UPDATE booking_requests SET status = 'presa_in_carico' WHERE status IN ('offerta_inviata', 'caparra_inviata', 'confermata');
ALTER TABLE booking_requests ADD CONSTRAINT booking_requests_status_check CHECK (status IN ('nuova', 'presa_in_carico'));