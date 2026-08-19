{ config, lib, pkgs, ... }:

let
  cfg = config.services.kmrl-orbit;
  pythonEnv = pkgs.python3.withPackages (ps: with ps; [
    flask
    "flask-cors"
    gunicorn
    python-dotenv
  ]);
in
{
  options.services.kmrl-orbit = {
    enable = lib.mkEnableOption "the KMRL Orbit Flask API";

    hostName = lib.mkOption {
      type = lib.types.str;
      example = "api.example.com";
      description = "Nginx virtual-host name used to publish the API.";
    };

    passengerOrigin = lib.mkOption {
      type = lib.types.str;
      example = "https://passenger.example.com";
      description = "Allowed Passenger Portal origin for CORS.";
    };

    driverOrigin = lib.mkOption {
      type = lib.types.str;
      example = "https://driver.example.com";
      description = "Allowed Driver Portal origin for CORS.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8000;
      description = "Local-only port on which Gunicorn listens.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.kmrl-orbit-api = {
      description = "KMRL Orbit Flask API";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];

      environment = {
        FLASK_ENV = "production";
        DATABASE_PATH = "/var/lib/kmrl-orbit/orbit.sqlite3";
        PASSENGER_ORIGIN = cfg.passengerOrigin;
        DRIVER_ORIGIN = cfg.driverOrigin;
      };

      serviceConfig = {
        DynamicUser = true;
        StateDirectory = "kmrl-orbit";
        WorkingDirectory = "${../../backend}";
        ExecStart = "${pythonEnv}/bin/gunicorn --bind 127.0.0.1:${toString cfg.port} --workers 2 --timeout 60 wsgi:app";
        Restart = "always";
        RestartSec = 5;
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ReadWritePaths = [ "/var/lib/kmrl-orbit" ];
      };
    };

    services.nginx = {
      enable = lib.mkDefault true;
      virtualHosts.${cfg.hostName} = {
        locations."/api/".proxyPass = "http://127.0.0.1:${toString cfg.port}";
        locations."/".proxyPass = "http://127.0.0.1:${toString cfg.port}";
      };
    };
  };
}
