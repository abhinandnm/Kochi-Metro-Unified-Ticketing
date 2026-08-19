# Deployment

## Vercel: two independent portals

Create two Vercel projects from the same Git repository:

| Project | Root Directory | Production environment variable |
| --- | --- | --- |
| Passenger Booking | `passenger-portal` | `VITE_API_BASE_URL=https://YOUR_EC2_HOST/api` |
| Driver Portal | `driver-portal` | `VITE_API_BASE_URL=https://YOUR_EC2_HOST/api` |

Assign each project its own Vercel domain after deployment. Do not point either frontend at the other frontend; both communicate only with the API.

## EC2 API

On an Ubuntu EC2 instance, clone the repository and run:

```bash
cd /path/to/codexNightline
chmod +x deploy/ec2/setup.sh
sudo PASSENGER_ORIGIN=https://YOUR_PASSENGER.vercel.app DRIVER_ORIGIN=https://YOUR_DRIVER.vercel.app ./deploy/ec2/setup.sh https://github.com/abhinandnm/codexNightline.git
```

Allow inbound HTTP (80) in the EC2 security group. For HTTPS, add a DNS record for the EC2 host and install a TLS certificate with Certbot before using `https` in Vercel variables.

Useful checks:

```bash
sudo systemctl status kmrl-orbit-api nginx
curl http://127.0.0.1/api/health
```

## NixOS API

A declarative NixOS module is available at [`deploy/nixos/kmrl-orbit.nix`](deploy/nixos/kmrl-orbit.nix). It packages the Flask/Gunicorn runtime with Nix, runs it as a hardened systemd service, persists SQLite data under `/var/lib/kmrl-orbit`, and proxies the API through Nginx. See [`deploy/nixos/README.md`](deploy/nixos/README.md) for the clone-and-deploy configuration.
