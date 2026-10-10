-- Why a booking needs the owner's attention (shown in the admin Bookings list). Milestone 3.
ALTER TABLE event_bookings ADD COLUMN attention_note TEXT;
