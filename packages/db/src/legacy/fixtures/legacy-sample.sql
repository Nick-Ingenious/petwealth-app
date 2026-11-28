-- A small, made-up copy of the old app's schema and data, covering the cases in
-- docs/LEGACY_MAPPING.md. Used by import.integration.test.ts. Not real data.
-- Only the columns the import reads; types match the old migrations.

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  auth0_user_id varchar(255) UNIQUE NOT NULL,
  email varchar(255) NOT NULL,
  first_name varchar(100), last_name varchar(100), phone varchar(20),
  customer_type varchar(50), role varchar(50), user_type varchar(50),
  is_active boolean DEFAULT true, first_time_login boolean DEFAULT true,
  contact_preference jsonb DEFAULT '{"email":false,"sms":false}',
  billing_address jsonb, shipping_address jsonb,
  password_hash varchar(255),
  last_login timestamptz,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE breeds (id SERIAL PRIMARY KEY, name varchar NOT NULL);
CREATE TABLE animal (
  id SERIAL PRIMARY KEY, pet_id varchar NOT NULL, owner_user_id varchar REFERENCES users(auth0_user_id) ON DELETE CASCADE,
  name varchar, species varchar, type varchar, breed varchar, breed_id int REFERENCES breeds(id),
  gender varchar(20), date_of_birth date, age_months int, weight_pounds numeric(6,2), spayed boolean NOT NULL DEFAULT true,
  microchip varchar, vet_notes text, additional_notes text, photo_url text, photo_source varchar,
  status varchar DEFAULT 'active', deleted_at timestamp,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE orders (
  id SERIAL PRIMARY KEY, order_id varchar UNIQUE NOT NULL, user_id varchar REFERENCES users(auth0_user_id) ON DELETE SET NULL, user_email varchar,
  status varchar DEFAULT 'pending', total_amount numeric(12,2), shipping_cost numeric, discount_amount numeric(12,2), tax_amount numeric(10,2),
  product_details jsonb[], shipping_address jsonb, order_type varchar, shopify_webhook_id varchar, shopify_order_id varchar,
  label_id varchar, tracking_url varchar, tracking_number varchar, carrier varchar, tracking_status varchar,
  shipped_at timestamp, delivered_at timestamp,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE order_kits (
  id SERIAL PRIMARY KEY, order_id int REFERENCES orders(id) ON DELETE CASCADE, order_product_index int,
  kit_type varchar, kit_id text UNIQUE, kit_number text UNIQUE, created_at timestamp DEFAULT now()
);
CREATE TABLE order_comments (id BIGSERIAL PRIMARY KEY, order_id int REFERENCES orders(id), comments jsonb NOT NULL DEFAULT '[]', created_at timestamptz DEFAULT now());
CREATE TABLE logistic_kits (id SERIAL PRIMARY KEY, kit_id varchar(32) UNIQUE, status varchar, species varchar);
CREATE TABLE tests (
  id SERIAL PRIMARY KEY, kit_code varchar UNIQUE NOT NULL, animal_id int REFERENCES animal(id) ON DELETE SET NULL,
  owner_id varchar REFERENCES users(auth0_user_id) ON DELETE CASCADE, kit_type varchar, status varchar,
  tracking_number varchar, carrier varchar, tracking_status varchar, tracking_url varchar, shipped_at timestamp, delivered_at timestamp,
  received_at_lab_at timestamp, fedex_return_shipment_id bigint,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE tests_status_history (id SERIAL PRIMARY KEY, kit_code varchar NOT NULL, status varchar NOT NULL, changed_at timestamp NOT NULL DEFAULT now(), changed_by varchar);
CREATE TABLE pet_score (
  id SERIAL PRIMARY KEY, test_id varchar UNIQUE, pet_id int, customer_email varchar, kit_type varchar, health_status varchar,
  detected_pathogens jsonb, non_detected_pathogens jsonb, ai_summary_text text, ai_recommendations jsonb, pdf_s3_url text,
  created_at timestamp DEFAULT now()
);
CREATE TABLE fedex_return_shipments (
  id BIGSERIAL PRIMARY KEY, owner_user_id varchar NOT NULL, customer_email varchar NOT NULL, status varchar, rma_number varchar UNIQUE,
  tracking_number varchar UNIQUE, qr_image_url text, fedex_status varchar, last_error text, first_scan_at timestamptz, last_synced_at timestamptz,
  processing_token text, email_claim_token text, created_at timestamptz DEFAULT now()
);
CREATE TABLE lab_rerun_queue (id SERIAL PRIMARY KEY, kit_code varchar NOT NULL, target_key varchar NOT NULL, reason_code varchar, reason_note text, status varchar NOT NULL DEFAULT 'pending', attempt_count int NOT NULL DEFAULT 1, created_at timestamp DEFAULT now());

-- People: one customer with two accounts (Auth0 + mobile), a B2B customer, staff, the deleted-user placeholder.
INSERT INTO users (id, auth0_user_id, email, first_name, last_name, phone, role, contact_preference, shipping_address, password_hash, last_login, created_at) VALUES
  (1, 'auth0|aaa', 'Alex@Example.com', 'Alex', 'Rivers', NULL, 'PET_PARENT', '{"sms":true}', '{"line1":"1 Main St","city":"Austin","state":"TX","postal_code":"78701","country":"US"}', NULL, '2025-05-01T00:00:00Z', '2024-01-10 10:00:00'),
  (2, 'local|bbb', 'alex@example.com', 'Alexandra', NULL, '5125550100', 'PET_PARENT', '{"sms":false}', NULL, '$2b$12$notarealhash', '2026-02-01T00:00:00Z', '2025-03-01 10:00:00'),
  (3, 'auth0|ccc', 'vet@clinic.example', 'Sam', 'Vet', NULL, 'B2B_ADMIN', NULL, '{"address1":"9 Clinic Rd","city":"Denver","province_code":"CO","zip":"80202","country_code":"US"}', NULL, NULL, '2024-06-01 09:00:00'),
  (4, 'auth0|staff', 'ops@petwealth.com', 'Olive', 'Ops', NULL, 'OPS', NULL, NULL, NULL, NULL, '2024-01-01 00:00:00'),
  (5, 'deleted-user', 'deleted-user@petwealth.invalid', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-01-01 00:00:00');

INSERT INTO breeds (id, name) VALUES (1, 'Labrador Retriever');

-- Pets: a dog, a cat with only an age, a bird (skipped), a deleted pet nobody references (skipped).
INSERT INTO animal (id, pet_id, owner_user_id, name, species, type, breed_id, gender, date_of_birth, age_months, weight_pounds, spayed, microchip, vet_notes, additional_notes, photo_url, photo_source, status, updated_at) VALUES
  (10, 'p10', 'auth0|aaa', 'Biscuit', 'Dog', 'canine', 1, 'Male', '2020-04-01', NULL, 62.5, true, '985112003', 'Allergic to chicken', 'Loves fetch', 'pets/biscuit.jpg', 'custom', 'active', '2026-01-01 00:00:00'),
  (11, 'p11', 'local|bbb', 'Mochi', 'cat', 'feline', NULL, 'Female', NULL, 36, NULL, true, NULL, NULL, NULL, 'pets/mochi-ai.png', 'ai', 'active', '2026-06-15 00:00:00'),
  (12, 'p12', 'auth0|aaa', 'Tweety', 'Bird', 'avian', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, 'active', now()),
  (13, 'p13', 'auth0|aaa', 'Old Rex', 'dog', 'canine', NULL, NULL, NULL, NULL, NULL, true, NULL, NULL, NULL, NULL, NULL, 'deleted', now());

-- Orders: a delivered Shopify order, a guest order still open (no kits allocated yet), a cancelled order, an order with no owner at all.
INSERT INTO orders (id, order_id, user_id, user_email, status, total_amount, shipping_cost, discount_amount, tax_amount, product_details, shipping_address, shopify_order_id, tracking_number, carrier, tracking_status, shipped_at, delivered_at, created_at, updated_at) VALUES
  (100, 'ORDER-GCS-000100-001', 'auth0|aaa', 'alex@example.com', 'delivered', 206.42, 0, 10.00, 18.42,
    ARRAY['{"name":"Canine Fecal Kit","quantity":1,"unit_price":"99.00","species":"canine","kit_type":"Canine Fecal Kit"}','{"name":"Feline Oral Kit","quantity":1,"unit_price":"99.00","species":"feline","kit_type":"Feline Oral Kit"}']::jsonb[],
    '{"address1":"1 Main St","city":"Austin","province_code":"TX","zip":"78701","country_code":"US","first_name":"Alex","last_name":"Rivers"}',
    '5550001', '7712345', 'FedEx', 'DE', '2026-01-05 12:00:00', '2026-01-07 15:00:00', '2026-01-03 09:00:00', '2026-01-07 15:00:00'),
  (101, 'ORDER-GCS-000101-002', NULL, 'Guest@Shopper.example', 'placed', 279.00, 0, 0, 0,
    ARRAY['{"name":"Complete Canine Health Kit","quantity":1,"unit_price":"279.00","species":"canine","kit_type":"Canine Complete Kit"}']::jsonb[],
    '{"address1":"5 Elm Ave","city":"Boise","province_code":"ID","zip":"83702","country_code":"US","first_name":"Gus","last_name":"Guest"}',
    '5550002', NULL, NULL, NULL, NULL, NULL, '2026-02-10 09:00:00', '2026-02-10 09:00:00'),
  (102, 'ORDER-GCS-000102-003', 'auth0|ccc', 'vet@clinic.example', 'cancelled', 99.00, 0, 0, 0,
    ARRAY['{"name":"Canine Oral Kit","quantity":1,"unit_price":"99.00","species":"canine","kit_type":"Canine Oral Kit"}']::jsonb[],
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-01 09:00:00', '2026-03-02 09:00:00'),
  (103, 'ORDER-GCS-000103-004', NULL, NULL, 'placed', 99.00, 0, 0, 0, ARRAY[]::jsonb[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-05 09:00:00', '2026-03-05 09:00:00');

INSERT INTO order_kits (order_id, order_product_index, kit_type, kit_id, kit_number) VALUES
  (100, 0, 'Canine Fecal Kit', '1', 'CFEC-001-001'),
  (100, 1, 'Feline Oral Kit', '2', 'FORA-001-002');
INSERT INTO order_comments (order_id, comments) VALUES (100, '[{"message":"Customer asked for a Friday delivery","author":"Olive Ops","role":"OPS","created_at":"2026-01-04T10:00:00Z"}]');

INSERT INTO logistic_kits (kit_id, status, species) VALUES ('CFEC-001-001', 'assigned', 'canine'), ('FORA-001-002', 'activated', 'feline'), ('CRES-009-999', 'generated', 'canine'), ('RES-000-050', 'assigned', 'feline');

-- Kits: dog fecal completed with a result, cat oral allocated but not activated, an old code with no species
-- letter, a kit whose owner was deleted (skipped), a SKIN kit (skipped).
INSERT INTO tests (id, kit_code, animal_id, owner_id, kit_type, status, received_at_lab_at, fedex_return_shipment_id, created_at, updated_at) VALUES
  (200, 'CFEC-001-001', 10, 'auth0|aaa', 'Canine Fecal Kit', 'completed', '2026-01-12 10:00:00', 300, '2026-01-08 10:00:00', '2026-01-14 10:00:00'),
  (201, 'RES-000-050', 11, 'local|bbb', 'Feline Respiratory Kit', 'awaiting_rerun', '2026-01-20 10:00:00', NULL, '2026-01-15 10:00:00', '2026-01-21 10:00:00'),
  (202, 'FFEC-002-002', NULL, NULL, 'Feline Fecal Kit', 'in_transit', NULL, NULL, '2026-01-15 10:00:00', '2026-01-16 10:00:00'),
  (203, 'SKN-001-001', 10, 'auth0|aaa', 'Canine Skin Kit', 'activated', NULL, NULL, '2026-01-15 10:00:00', '2026-01-16 10:00:00');
UPDATE tests SET tracking_number = '7700001', carrier = 'FedEx', tracking_status = 'IT', shipped_at = '2026-01-18 10:00:00' WHERE id = 201;

INSERT INTO tests_status_history (kit_code, status, changed_at, changed_by) VALUES
  ('CFEC-001-001', 'activated', '2026-01-08 10:00:00', NULL),
  ('CFEC-001-001', 'received_at_lab', '2026-01-12 10:00:00', 'Lab Tech'),
  ('CFEC-001-001', 'completed', '2026-01-14 10:00:00', 'Lab Tech');

INSERT INTO pet_score (test_id, pet_id, customer_email, kit_type, health_status, detected_pathogens, non_detected_pathogens, ai_summary_text, ai_recommendations, pdf_s3_url, created_at) VALUES
  ('CFEC-001-001', 10, 'alex@example.com', 'FECAL', 'NeedsAttention', '[{"name":"Giardia spp.","normalized_key":"giardia","cq":28.1}]', '[{"name":"Salmonella spp.","normalized_key":"salmonella","cq":null}]',
   'Biscuit tested positive for Giardia, a common gut parasite.', '["Share these results with your vet", "Pick up after Biscuit promptly"]', 'reports/CFEC-001-001.pdf', '2026-01-14 10:00:00');

INSERT INTO fedex_return_shipments (id, owner_user_id, customer_email, status, rma_number, tracking_number, qr_image_url, fedex_status, processing_token, created_at) VALUES
  (300, 'auth0|aaa', 'alex@example.com', 'delivered', 'PWR0100007', '7799001', 'returns/PWR0100007.png', 'Delivered', 'secret-token', '2026-01-09 10:00:00');

INSERT INTO lab_rerun_queue (kit_code, target_key, reason_code, reason_note, status, attempt_count) VALUES
  ('RES-000-050', 'feline_calicivirus', 'LOW_SIGNAL', 'Extraction control weak', 'pending', 1),
  ('CFEC-001-001', 'giardia', NULL, NULL, 'resolved', 2);
