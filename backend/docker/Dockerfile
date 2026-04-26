FROM ubuntu:22.04

# Avoid interactive prompts during install
ENV DEBIAN_FRONTEND=noninteractive

# Install essential tools students will use in the course
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    coreutils \
    findutils \
    grep \
    sed \
    gawk \
    tar \
    gzip \
    zip \
    unzip \
    nano \
    vim-tiny \
    less \
    tree \
    file \
    curl \
    wget \
    net-tools \
    iputils-ping \
    man-db \
    && rm -rf /var/lib/apt/lists/*

# Create the student user (uid 1000)
RUN useradd -m -s /bin/bash -u 1000 student

# Set up the student home directory with course files
USER student
WORKDIR /home/student

RUN mkdir -p Documents Downloads Desktop \
    && echo "This is file1.txt" > file1.txt \
    && echo "Hidden file" > .hidden \
    && printf '#!/bin/bash\necho "Hello"\n' > script.sh

# Dynamic prompt & whoami using STUDENT_NAME env var (passed at runtime)
RUN echo 'export TERM=xterm-256color' >> /home/student/.bashrc \
    && echo 'whoami() { echo "${STUDENT_NAME:-student}"; }' >> /home/student/.bashrc \
    && echo 'export -f whoami' >> /home/student/.bashrc \
    && echo 'id() { echo "uid=1000(${STUDENT_NAME:-student}) gid=1000(${STUDENT_NAME:-student}) groups=1000(${STUDENT_NAME:-student})"; }' >> /home/student/.bashrc \
    && echo 'export -f id' >> /home/student/.bashrc \
    && echo "PS1='\\[\\e[0;32m\\]\${STUDENT_NAME:-student}@linux\\[\\e[0m\\]:\\[\\e[0;34m\\]\\w\\[\\e[0m\\]\\$ '" >> /home/student/.bashrc

USER student
CMD ["/bin/bash", "-l"]
