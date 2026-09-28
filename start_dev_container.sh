#!/bin/bash
docker compose build --no-cache app
docker compose up -d --force-recreate app
