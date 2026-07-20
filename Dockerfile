FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml pom.xml
COPY apps/backend/pom.xml apps/backend/pom.xml
COPY apps/backend/src apps/backend/src
RUN mvn --batch-mode --no-transfer-progress -pl apps/backend -am package -DskipTests

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN useradd --system --create-home --uid 10001 novel
COPY --from=build /workspace/apps/backend/target/novel-platform-api-0.1.0.jar /app/app.jar
USER novel
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
