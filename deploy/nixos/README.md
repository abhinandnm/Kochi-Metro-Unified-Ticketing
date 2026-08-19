# NixOS API deployment

This module runs the Flask API through Gunicorn and exposes it through Nginx. Python dependencies are supplied by Nix, and the SQLite database is persisted outside the Nix store at `/var/lib/kmrl-orbit/orbit.sqlite3`.

## Use after cloning

Clone this repository somewhere accessible to `root`, for example `/etc/nixos/kmrl-orbit`:

```bash
sudo git clone https://github.com/abhinandnm/codexNightline.git /etc/nixos/kmrl-orbit
```

Add the module and its settings to `/etc/nixos/configuration.nix`. Replace the example origins and hostname with your real public URLs.

```nix
{
  imports = [
    ./hardware-configuration.nix
    /etc/nixos/kmrl-orbit/deploy/nixos/kmrl-orbit.nix
  ];

  services.kmrl-orbit = {
    enable = true;
    hostName = "api.example.com";
    passengerOrigin = "https://passenger.example.com";
    driverOrigin = "https://driver.example.com";
  };

  networking.firewall.allowedTCPPorts = [ 80 ];
}
```

Apply it:

```bash
sudo nixos-rebuild switch
curl http://127.0.0.1/api/health
systemctl status kmrl-orbit-api
```

The module binds Gunicorn only to `127.0.0.1:8000`; open only Nginx's HTTP/HTTPS ports in the firewall. For HTTPS, add your preferred NixOS ACME/TLS configuration to the same Nginx virtual host. When changing the cloned source, run `sudo nixos-rebuild switch` again so Nix rebuilds the service from the updated revision.
