-- Store the student's recipient preference for invoices issued in the future.
-- Additive and idempotent; issued invoices and payment amounts are untouched.
SELECT id FROM students LIMIT 0;
SET @ln_invoice_address_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='invoice_recipient'), 'SELECT 1', 'ALTER TABLE students ADD COLUMN invoice_recipient ENUM(''student'',''company'') NOT NULL DEFAULT ''student''');
PREPARE ln_invoice_address_stmt FROM @ln_invoice_address_sql;
EXECUTE ln_invoice_address_stmt;
DEALLOCATE PREPARE ln_invoice_address_stmt;
SET @ln_invoice_address_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='invoice_company'), 'SELECT 1', 'ALTER TABLE students ADD COLUMN invoice_company VARCHAR(200) DEFAULT NULL');
PREPARE ln_invoice_address_stmt FROM @ln_invoice_address_sql;
EXECUTE ln_invoice_address_stmt;
DEALLOCATE PREPARE ln_invoice_address_stmt;
SET @ln_invoice_address_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='invoice_address'), 'SELECT 1', 'ALTER TABLE students ADD COLUMN invoice_address VARCHAR(400) DEFAULT NULL');
PREPARE ln_invoice_address_stmt FROM @ln_invoice_address_sql;
EXECUTE ln_invoice_address_stmt;
DEALLOCATE PREPARE ln_invoice_address_stmt;
