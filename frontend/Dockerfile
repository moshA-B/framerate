# frontend/Dockerfile - the recipe for the website container.
# The site is only static files (HTML, CSS, JS), so we just need a web server: nginx.

# Official nginx image, the "alpine" version is very small.
FROM nginx:alpine

# Our own server settings (see nginx.conf: they stop browsers from keeping old copies of the site).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy our site into the folder nginx serves files from.
COPY . /usr/share/nginx/html

# The two files below are for building the container, not part of the website: remove them.
RUN rm -f /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/Dockerfile

# nginx listens on port 80 inside the container (compose maps it to 8080 on your PC).
EXPOSE 80
