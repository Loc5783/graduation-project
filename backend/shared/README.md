# Backend Shared

Code used by multiple backend modules belongs here.

Typical responsibilities:
- MQTT client and connection management
- Database connection
- Authentication / authorization
- Shared configuration
- Logging
- Error handling
- Common utilities

Changes here can affect the whole system, so they should be reviewed carefully before merging into `integration`.
