-- Add feature flags to settings table to control feature visibility
-- These flags allow soft deactivation of features without removing code or data

-- Add enable_position_monitor flag (controls Live Trade Tracker / PositionMonitor visibility)
-- Default to 0 (disabled) to immediately deactivate the feature
ALTER TABLE settings ADD COLUMN enable_position_monitor INTEGER NOT NULL DEFAULT 0;

-- Add enable_api_connections flag (controls Exchange Connections / API sync visibility)
-- Default to 0 (disabled) to immediately deactivate the feature
ALTER TABLE settings ADD COLUMN enable_api_connections INTEGER NOT NULL DEFAULT 0;
