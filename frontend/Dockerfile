# frontend/Dockerfile - the recipe for the website container.
# The site is only static files (HTML, CSS, JS), so we just need a web server: nginx.

# Official nginx image, the "alpine" version is very small.
FROM nginx:alpine

# Copy our site into the folder nginx serves files from.
COPY . /usr/share/nginx/html

# nginx listens on port 80 inside the container (compose maps it to 8080 on your PC).
EXPOSE 80
