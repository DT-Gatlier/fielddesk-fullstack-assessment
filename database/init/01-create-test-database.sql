-- Runs once, when the PostgreSQL container initialises an empty data volume.
-- Creates the separate database used by the automated test suite so tests
-- never touch development data.
CREATE DATABASE fielddesk_test OWNER fielddesk;
