CREATE ROLE archimesh_owner LOGIN PASSWORD 'compose-owner';
CREATE ROLE archimesh_app LOGIN PASSWORD 'compose-app';
CREATE ROLE archimesh_test_owner LOGIN PASSWORD 'compose-test-owner';
CREATE ROLE archimesh_test_app LOGIN PASSWORD 'compose-test-app';
CREATE DATABASE archimesh OWNER archimesh_owner;
CREATE DATABASE archimesh_test OWNER archimesh_test_owner;
REVOKE CONNECT ON DATABASE archimesh FROM PUBLIC;
REVOKE CONNECT ON DATABASE archimesh_test FROM PUBLIC;
GRANT CONNECT ON DATABASE archimesh TO archimesh_app;
GRANT CONNECT ON DATABASE archimesh_test TO archimesh_test_app;
\connect archimesh
ALTER DEFAULT PRIVILEGES FOR ROLE archimesh_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO archimesh_app;
\connect archimesh_test
ALTER DEFAULT PRIVILEGES FOR ROLE archimesh_test_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO archimesh_test_app;
