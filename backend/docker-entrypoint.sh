#!/bin/sh
set -e

npm run migrate
npm run seed
exec npm run dev
